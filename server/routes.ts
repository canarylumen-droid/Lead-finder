import { Router, type Request, type Response } from "express";
import {
  createUser, getUserByEmail, verifyPassword,
  createSession, getSessionsByUser, getSession, streamLeadsForCSV,
} from "./storage.js";
import { launchSessionSchema } from "../shared/schema.js";
import { runScrapeSession, cancelledSessions, pausedSessions } from "./scraper/google-maps-scraper.js";
import { db } from "./db.js";
import { leads, scrapeSessions } from "../shared/schema.js";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import os from "os";

export const router = Router();

// ─── Country phone codes ───────────────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  "USA": "+1", "Canada": "+1",
  "UK": "+44", "United Kingdom": "+44",
  "Australia": "+61", "New Zealand": "+64",
  "UAE": "+971", "Saudi Arabia": "+966",
  "India": "+91", "Pakistan": "+92", "Bangladesh": "+880",
  "Germany": "+49", "France": "+33", "Italy": "+39", "Spain": "+34",
  "Netherlands": "+31", "Belgium": "+32", "Switzerland": "+41", "Austria": "+43",
  "Sweden": "+46", "Norway": "+47", "Denmark": "+45", "Finland": "+358",
  "Poland": "+48", "Czech Republic": "+420", "Hungary": "+36", "Romania": "+40",
  "Greece": "+30", "Turkey": "+90", "Portugal": "+351", "Ireland": "+353",
  "Singapore": "+65", "Malaysia": "+60", "Philippines": "+63",
  "Thailand": "+66", "Vietnam": "+84", "Indonesia": "+62", "South Korea": "+82",
  "Japan": "+81", "China": "+86",
  "Brazil": "+55", "Mexico": "+52", "Argentina": "+54", "Colombia": "+57",
  "South Africa": "+27", "Nigeria": "+234", "Kenya": "+254", "Egypt": "+20",
};

function formatPhone(raw: string | null, country: string): string {
  if (!raw) return "";
  const p = raw.trim();
  if (!p) return "";
  if (p.startsWith("+")) return p;
  const code = COUNTRY_CODES[country];
  if (!code) return p;
  const digits = p.replace(/^0/, "").replace(/[\s\-().]/g, "");
  return `${code}${digits}`;
}

// ── Health check ──────────────────────────────────────────────────────────────
router.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Server IP ─────────────────────────────────────────────────────────────────
let _cachedIp: string | null = null;
router.get("/api/server-ip", async (_req: Request, res: Response) => {
  if (_cachedIp) { res.json({ ip: _cachedIp }); return; }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(t);
    const data = await r.json() as { ip: string };
    _cachedIp = data.ip;
    res.json({ ip: data.ip });
  } catch {
    const nets = os.networkInterfaces();
    let ip = "unknown";
    for (const ifaces of Object.values(nets)) {
      for (const iface of (ifaces ?? [])) {
        if (iface.family === "IPv4" && !iface.internal) { ip = iface.address; break; }
      }
      if (ip !== "unknown") break;
    }
    res.json({ ip });
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────
const authSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

router.post("/api/auth/register", async (req: Request, res: Response) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: "Invalid email or password (min 6 chars)" });
  const { email, password } = parsed.data;
  const existing = await getUserByEmail(email);
  if (existing) return void res.status(409).json({ message: "Email already registered" });
  const user = await createUser(email, password);
  res.json({ user: { id: user.id, email: user.email } });
});

router.post("/api/auth/login", async (req: Request, res: Response) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: "Invalid email or password" });
  const { email, password } = parsed.data;
  const user = await getUserByEmail(email);
  if (!user) return void res.status(401).json({ message: "No account with that email" });
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) return void res.status(401).json({ message: "Incorrect password" });
  res.json({ user: { id: user.id, email: user.email } });
});

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireUser(req: Request, res: Response): number | null {
  const raw = req.headers["x-user-id"];
  const id  = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (isNaN(id)) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return id;
}

// ── Sessions ──────────────────────────────────────────────────────────────────
router.post("/api/sessions", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = launchSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return void res.status(400).json({ message: msg });
  }

  const { niches, cities, countries, cityCountryMap, maxReviews, targetVolume, includePhone } = parsed.data;

  const session = await createSession({
    userId,
    niches: JSON.stringify(niches),
    cities: JSON.stringify(cities),
    country: JSON.stringify(countries),
    maxReviews,
    targetVolume,
    includePhone,
  });

  runScrapeSession({
    sessionId: session.id, userId, niches, cities, cityCountryMap,
    maxReviews, targetVolume, includePhone: includePhone === 1,
  }).catch((err) => console.error(`[scraper] session ${session.id} failed:`, err.message));

  res.status(201).json({ session: formatSession(session) });
});

router.get("/api/sessions", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const sessions = await getSessionsByUser(userId);
  res.json({ sessions: sessions.map(formatSession) });
});

router.get("/api/sessions/:id", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const session = await getSession(parseInt(String(req.params.id), 10));
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });
  res.json({ session: formatSession(session) });
});

// ── Session control: Abort ─────────────────────────────────────────────────────
router.post("/api/sessions/:id/abort", async (req: Request, res: Response) => {
  const userId    = requireUser(req, res);
  if (!userId) return;
  const sessionId = parseInt(String(req.params.id), 10);
  const session   = await getSession(sessionId);
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });
  if (session.status !== "running") return void res.status(400).json({ message: "Session is not running" });

  cancelledSessions.add(sessionId);
  pausedSessions.delete(sessionId);

  await db
    .update(scrapeSessions)
    .set({ status: "failed", errorMessage: "Aborted by user", completedAt: new Date() })
    .where(eq(scrapeSessions.id, sessionId));

  res.json({ ok: true, message: "Session aborting…" });
});

// ── Session control: Pause ────────────────────────────────────────────────────
router.post("/api/sessions/:id/pause", async (req: Request, res: Response) => {
  const userId    = requireUser(req, res);
  if (!userId) return;
  const sessionId = parseInt(String(req.params.id), 10);
  const session   = await getSession(sessionId);
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });
  if (session.status !== "running") return void res.status(400).json({ message: "Session is not running" });

  pausedSessions.add(sessionId);

  await db
    .update(scrapeSessions)
    .set({ status: "paused" })
    .where(eq(scrapeSessions.id, sessionId));

  res.json({ ok: true, message: "Session paused" });
});

// ── Session control: Resume ───────────────────────────────────────────────────
router.post("/api/sessions/:id/resume", async (req: Request, res: Response) => {
  const userId    = requireUser(req, res);
  if (!userId) return;
  const sessionId = parseInt(String(req.params.id), 10);
  const session   = await getSession(sessionId);
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  pausedSessions.delete(sessionId);

  await db
    .update(scrapeSessions)
    .set({ status: "running" })
    .where(eq(scrapeSessions.id, sessionId));

  res.json({ ok: true, message: "Session resumed" });
});

// ── Session control: Restart (re-launch same config as new session) ───────────
router.post("/api/sessions/:id/restart", async (req: Request, res: Response) => {
  const userId    = requireUser(req, res);
  if (!userId) return;
  const sessionId = parseInt(String(req.params.id), 10);
  const old       = await getSession(sessionId);
  if (!old || old.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const niches        = tryParse(old.niches,  [] as string[]);
  const cities        = tryParse(old.cities,  [] as string[]);
  const countriesRaw  = tryParse(old.country, [] as string[]);
  const countries     = Array.isArray(countriesRaw) ? countriesRaw : [old.country];

  // Build cityCountryMap from session countries/cities (best-effort)
  const cityCountryMap: Record<string, string> = {};
  for (const city of cities) {
    cityCountryMap[city] = countries[0] ?? "Unknown";
  }

  const newSession = await createSession({
    userId,
    niches:       old.niches,
    cities:       old.cities,
    country:      old.country,
    maxReviews:   old.maxReviews,
    targetVolume: old.targetVolume,
    includePhone: old.includePhone,
  });

  runScrapeSession({
    sessionId:    newSession.id,
    userId,
    niches,
    cities,
    cityCountryMap,
    maxReviews:   old.maxReviews,
    targetVolume: old.targetVolume,
    includePhone: old.includePhone === 1,
  }).catch((err) => console.error(`[scraper] restart session ${newSession.id} failed:`, err.message));

  res.status(201).json({ session: formatSession(newSession) });
});

// ── Paginated leads (session-specific) ────────────────────────────────────────
router.get("/api/sessions/:id/leads", async (req: Request, res: Response) => {
  const userId    = requireUser(req, res);
  if (!userId) return;
  const sessionId = parseInt(String(req.params.id), 10);
  const session   = await getSession(sessionId);
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));

  const [rows, cnt] = await Promise.all([
    db.select().from(leads)
      .where(and(eq(leads.sessionId, sessionId), eq(leads.userId, userId)))
      .orderBy(desc(leads.scrapedAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: sql<number>`cast(count(*) as int)` })
      .from(leads)
      .where(and(eq(leads.sessionId, sessionId), eq(leads.userId, userId))),
  ]);

  res.json({ leads: rows, page, limit, total: cnt[0]?.total ?? session.leadsCount });
});

// ── Aggregate stats for user (KPIs) ───────────────────────────────────────────
router.get("/api/stats", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const [row] = await db
    .select({
      totalLeads:     sql<number>`cast(count(*) as int)`,
      totalEmails:    sql<number>`cast(count(${leads.email}) as int)`,
      totalPhones:    sql<number>`cast(count(${leads.phone}) as int)`,
      verifiedEmails: sql<number>`cast(coalesce(sum(case when ${leads.emailVerified} = 1 then 1 else 0 end), 0) as int)`,
      totalReviews:   sql<number>`cast(coalesce(sum(${leads.reviewsCount}), 0) as int)`,
      avgReviews:     sql<number>`cast(coalesce(round(avg(${leads.reviewsCount})::numeric, 1), 0) as float)`,
      withWebsite:    sql<number>`cast(count(${leads.website}) as int)`,
      withMapsUrl:    sql<number>`cast(count(${leads.mapsUrl}) as int)`,
    })
    .from(leads)
    .where(eq(leads.userId, userId));

  res.json(row ?? {
    totalLeads: 0, totalEmails: 0, totalPhones: 0, verifiedEmails: 0,
    totalReviews: 0, avgReviews: 0, withWebsite: 0, withMapsUrl: 0,
  });
});

// ── Lead search ───────────────────────────────────────────────────────────────
router.get("/api/leads/search", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const q     = String(req.query.q ?? "").trim();
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));

  if (!q || q.length < 2) return void res.json({ leads: [], total: 0, q });

  const filter = and(
    eq(leads.userId, userId),
    or(
      ilike(leads.name,    `%${q}%`),
      ilike(leads.niche,   `%${q}%`),
      ilike(leads.city,    `%${q}%`),
      ilike(leads.email,   `%${q}%`),
      ilike(leads.phone,   `%${q}%`),
      ilike(leads.address, `%${q}%`),
    ),
  );

  const [rows, cnt] = await Promise.all([
    db.select().from(leads).where(filter).orderBy(desc(leads.scrapedAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`cast(count(*) as int)` }).from(leads).where(filter),
  ]);

  res.json({ leads: rows, total: cnt[0]?.total ?? 0, q });
});

// ── CSV download (single session) ─────────────────────────────────────────────
router.get("/api/sessions/:id/download", async (req: Request, res: Response) => {
  const userId  = requireUser(req, res);
  if (!userId) return;
  const session = await getSession(parseInt(String(req.params.id), 10));
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const allLeads = await streamLeadsForCSV(session.id, userId);
  const niches   = tryParse(session.niches, [] as string[]);
  const filename = `leads_${(niches[0] ?? "data").replace(/\s+/g, "_")}_${session.id}_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buildCSV(allLeads));
});

// ── CSV export (all leads for user) ───────────────────────────────────────────
router.get("/api/leads/export", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const allLeads = await db
    .select()
    .from(leads)
    .where(eq(leads.userId, userId))
    .orderBy(desc(leads.scrapedAt));

  if (allLeads.length === 0) return void res.status(404).json({ message: "No leads found" });

  const filename = `all_leads_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buildCSV(allLeads));
});

// ─── CSV builder ──────────────────────────────────────────────────────────────
type LeadRow = typeof leads.$inferSelect;

function buildCSV(rows: LeadRow[]): string {
  const header = ["Niche","Business Name","City","Country","Address","Phone","Email","Email Verified","Website","Google Maps URL","Rating","Reviews"].map(csv).join(",");
  const body   = rows.map((l) => [
    csv(l.niche),
    csv(l.name),
    csv(l.city),
    csv(l.country),
    csv(l.address ?? ""),
    csv(formatPhone(l.phone, l.country)),
    csv(l.email ?? ""),
    l.emailVerified === 1 ? "Yes" : l.email ? "Unverified" : "",
    csv(l.website ?? ""),
    csv(l.mapsUrl ?? ""),
    csv(l.rating ?? ""),
    l.reviewsCount ?? "",
  ].join(",")).join("\n");
  return header + "\n" + body;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function csv(v: string): string { return `"${String(v ?? "").replace(/"/g, '""')}"`; }

function formatSession(s: typeof import("../shared/schema.js").scrapeSessions.$inferSelect) {
  const countries = tryParse(s.country, null);
  return {
    ...s,
    niches:    tryParse(s.niches, []),
    cities:    tryParse(s.cities, []),
    countries: Array.isArray(countries) ? countries : [s.country],
    country:   Array.isArray(countries) ? countries.join(", ") : s.country,
  };
}

function tryParse(v: string, fallback: unknown) {
  try { return JSON.parse(v); } catch { return fallback; }
}
