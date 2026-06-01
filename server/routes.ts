import { Router, type Request, type Response } from "express";
import {
  createUser, getUserByEmail, verifyPassword,
  createSession, getSessionsByUser, getSession, streamLeadsForCSV,
} from "./storage.js";
import { launchSessionSchema } from "../shared/schema.js";
import { runScrapeSession } from "./scraper/google-maps-scraper.js";
import { db } from "./db.js";
import { leads } from "../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

export const router = Router();

// ── Health check ──────────────────────────────────────────────────────────────
router.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
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
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0]?.message });

  const { niches, cities, countries, cityCountryMap, maxReviews, targetVolume } = parsed.data;

  const session = await createSession({
    userId,
    niches: JSON.stringify(niches),
    cities: JSON.stringify(cities),
    country: JSON.stringify(countries),
    maxReviews,
    targetVolume,
  });

  runScrapeSession({ sessionId: session.id, userId, niches, cities, cityCountryMap, maxReviews, targetVolume })
    .catch((err) => console.error(`[scraper] session ${session.id} failed:`, err.message));

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

// ── Paginated leads ───────────────────────────────────────────────────────────
router.get("/api/sessions/:id/leads", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const sessionId = parseInt(String(req.params.id), 10);
  const session   = await getSession(sessionId);
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const pageRaw  = Array.isArray(req.query.page)  ? req.query.page[0]  : req.query.page;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const page  = Math.max(1, parseInt(String(pageRaw  ?? "1"),  10));
  const limit = Math.min(100, Math.max(1, parseInt(String(limitRaw ?? "50"), 10)));

  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.sessionId, sessionId), eq(leads.userId, userId)))
    .orderBy(desc(leads.scrapedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({ leads: rows, page, limit, total: session.leadsCount });
});

// ── CSV download (single session) ─────────────────────────────────────────────
router.get("/api/sessions/:id/download", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const session = await getSession(parseInt(String(req.params.id), 10));
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const allLeads = await streamLeadsForCSV(session.id, userId);

  const header = "Niche,Business Name,City,Country,Address,Phone,Email,Email Verified,Website,Rating,Reviews,Maps URL\n";
  const rows = allLeads.map((l) =>
    [
      csv(l.niche),
      csv(l.name),
      csv(l.city),
      csv(l.country),
      csv(l.address ?? ""),
      csv(l.phone ?? ""),
      csv(l.email ?? ""),
      l.emailVerified === 1 ? "Yes" : l.email ? "Unverified" : "",
      csv(l.website ?? ""),
      csv(l.rating ?? ""),
      l.reviewsCount ?? "",
      csv(l.mapsUrl ?? ""),
    ].join(",")
  ).join("\n");

  const niches   = tryParse(session.niches, [] as string[]);
  const filename = `leads_${(niches[0] ?? "data").replace(/\s+/g, "_")}_${session.id}_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(header + rows);
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

  if (allLeads.length === 0) {
    return void res.status(404).json({ message: "No leads found" });
  }

  const header = "Niche,Business Name,City,Country,Address,Phone,Email,Email Verified,Website,Rating,Reviews,Maps URL\n";
  const rows = allLeads.map((l) =>
    [
      csv(l.niche),
      csv(l.name),
      csv(l.city),
      csv(l.country),
      csv(l.address ?? ""),
      csv(l.phone ?? ""),
      csv(l.email ?? ""),
      l.emailVerified === 1 ? "Yes" : l.email ? "Unverified" : "",
      csv(l.website ?? ""),
      csv(l.rating ?? ""),
      l.reviewsCount ?? "",
      csv(l.mapsUrl ?? ""),
    ].join(",")
  ).join("\n");

  const filename = `all_leads_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(header + rows);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function csv(v: string): string { return `"${v.replace(/"/g, '""')}"`; }

function formatSession(s: typeof import("../shared/schema.js").scrapeSessions.$inferSelect) {
  const countries = tryParse(s.country, null);
  return {
    ...s,
    niches: tryParse(s.niches, []),
    cities: tryParse(s.cities, []),
    // country field: if stored as JSON array, return array; else wrap single string
    countries: Array.isArray(countries) ? countries : [s.country],
    country: Array.isArray(countries) ? countries.join(", ") : s.country,
  };
}

function tryParse(v: string, fallback: unknown) {
  try { return JSON.parse(v); } catch { return fallback; }
}
