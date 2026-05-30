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

  const { niches, cities, country, maxReviews, targetVolume } = parsed.data;

  const session = await createSession({
    userId,
    niches: JSON.stringify(niches),
    cities: JSON.stringify(cities),
    country,
    maxReviews,
    targetVolume,
  });

  // Fire-and-forget — survives browser close, runs until completion
  runScrapeSession({ sessionId: session.id, userId, niches, cities, country, maxReviews, targetVolume })
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
  const session = await getSession(parseInt(req.params.id, 10));
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });
  res.json({ session: formatSession(session) });
});

// ── Paginated leads ───────────────────────────────────────────────────────────
router.get("/api/sessions/:id/leads", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const sessionId = parseInt(req.params.id, 10);
  const session   = await getSession(sessionId);
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));

  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.sessionId, sessionId), eq(leads.userId, userId)))
    .orderBy(desc(leads.scrapedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({ leads: rows, page, limit, total: session.leadsCount });
});

// ── CSV download ──────────────────────────────────────────────────────────────
router.get("/api/sessions/:id/download", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const session = await getSession(parseInt(req.params.id, 10));
  if (!session || session.userId !== userId) return void res.status(404).json({ message: "Not found" });

  const allLeads = await streamLeadsForCSV(session.id, userId);

  const header = "Niche,City,Country,Business Name,Phone,Website,Rating,Reviews,Address,Email,Email Verified,Maps URL\n";
  const rows = allLeads.map((l) =>
    [
      csv(l.niche), csv(l.city), csv(l.country), csv(l.name),
      csv(l.phone ?? ""), csv(l.website ?? ""),
      csv(l.rating ?? ""), l.reviewsCount ?? "",
      csv(l.address ?? ""), csv(l.email ?? ""),
      l.emailVerified === 1 ? "Yes" : l.email ? "Unverified" : "",
      csv(l.mapsUrl ?? ""),
    ].join(",")
  ).join("\n");

  const niches   = tryParse(session.niches, [] as string[]);
  const filename = `leads_${niches[0] ?? "data"}_${session.id}_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(header + rows);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function csv(v: string): string { return `"${v.replace(/"/g, '""')}"`; }

function formatSession(s: typeof import("../shared/schema.js").scrapeSessions.$inferSelect) {
  return { ...s, niches: tryParse(s.niches, []), cities: tryParse(s.cities, []) };
}

function tryParse(v: string, fallback: unknown) {
  try { return JSON.parse(v); } catch { return fallback; }
}
