import { Router, type Request, type Response } from "express";
import { db } from "./db.js";
import { smtpProviders, smtpAccounts, domainAccountMap } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto-utils.js";
import { z } from "zod";

export const smtpRouter = Router();

function requireUser(req: Request, res: Response): number | null {
  const raw = req.headers["x-user-id"];
  const id  = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (isNaN(id)) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return id;
}

// ── GET /api/smtp/providers ───────────────────────────────────────────────────
smtpRouter.get("/api/smtp/providers", async (_req: Request, res: Response) => {
  const providers = await db.select().from(smtpProviders);
  res.json({ providers });
});

// ── POST /api/smtp/providers/:slug/fetch ─────────────────────────────────────
// Auto-fetch credentials from provider API using an API key
smtpRouter.post("/api/smtp/providers/:slug/fetch", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);
  const { slug } = req.params;

  try {
    if (slug === "resend") {
      const r = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) return void res.status(400).json({ message: "Resend API key invalid" });
      await r.json();
      res.json({
        smtpHost: "smtp.resend.com",
        smtpPort: 465,
        smtpUser: "resend",
        smtpPass: apiKey,
      });
    } else if (slug === "brevo") {
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": apiKey },
      });
      if (!r.ok) return void res.status(400).json({ message: "Brevo API key invalid" });
      const acct = await r.json() as { login?: string; email?: string };
      const login = acct.login ?? acct.email ?? "";
      res.json({
        smtpHost: "smtp-relay.brevo.com",
        smtpPort: 587,
        smtpUser: login,
        smtpPass: apiKey,
      });
    } else {
      res.status(400).json({ message: "Auto-fetch not supported for this provider" });
    }
  } catch {
    res.status(500).json({ message: "Failed to reach provider API" });
  }
});

// ── GET /api/smtp/accounts ────────────────────────────────────────────────────
smtpRouter.get("/api/smtp/accounts", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const accounts = await db
    .select()
    .from(smtpAccounts)
    .where(eq(smtpAccounts.userId, userId));

  // Mask encrypted fields before sending
  const safe = accounts.map((a) => ({
    ...a,
    apiKey:   a.apiKey   ? "••••••••" : null,
    smtpPass: a.smtpPass ? "••••••••" : null,
  }));
  res.json({ accounts: safe });
});

// ── POST /api/smtp/accounts ───────────────────────────────────────────────────
const accountSchema = z.object({
  providerId:  z.number().int().positive(),
  label:       z.string().min(1),
  apiKey:      z.string().optional(),
  smtpHost:    z.string().optional(),
  smtpPort:    z.number().int().optional(),
  smtpUser:    z.string().optional(),
  smtpPass:    z.string().optional(),
});

smtpRouter.post("/api/smtp/accounts", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });
  const { providerId, label, apiKey, smtpHost, smtpPort, smtpUser, smtpPass } = parsed.data;

  const [account] = await db.insert(smtpAccounts).values({
    userId,
    providerId,
    label,
    apiKey:   apiKey   ? encrypt(apiKey)   : null,
    smtpHost: smtpHost ?? null,
    smtpPort: smtpPort ?? null,
    smtpUser: smtpUser ?? null,
    smtpPass: smtpPass ? encrypt(smtpPass) : null,
    isActive: 1,
  }).returning();

  res.status(201).json({ account: { ...account, apiKey: apiKey ? "••••••••" : null, smtpPass: smtpPass ? "••••••••" : null } });
});

// ── PATCH /api/smtp/accounts/:id ─────────────────────────────────────────────
smtpRouter.patch("/api/smtp/accounts/:id", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);

  const [existing] = await db.select().from(smtpAccounts).where(and(eq(smtpAccounts.id, id), eq(smtpAccounts.userId, userId)));
  if (!existing) return void res.status(404).json({ message: "Not found" });

  const patch = accountSchema.partial().parse(req.body);
  const updates: Partial<typeof existing> = {};

  if (patch.label    !== undefined) updates.label    = patch.label;
  if (patch.smtpHost !== undefined) updates.smtpHost = patch.smtpHost ?? null;
  if (patch.smtpPort !== undefined) updates.smtpPort = patch.smtpPort ?? null;
  if (patch.smtpUser !== undefined) updates.smtpUser = patch.smtpUser ?? null;
  if (patch.apiKey   !== undefined && patch.apiKey !== "••••••••")   updates.apiKey   = patch.apiKey   ? encrypt(patch.apiKey)   : null;
  if (patch.smtpPass !== undefined && patch.smtpPass !== "••••••••") updates.smtpPass = patch.smtpPass ? encrypt(patch.smtpPass) : null;

  const [updated] = await db.update(smtpAccounts).set(updates).where(eq(smtpAccounts.id, id)).returning();
  res.json({ account: { ...updated, apiKey: updated.apiKey ? "••••••••" : null, smtpPass: updated.smtpPass ? "••••••••" : null } });
});

// ── DELETE /api/smtp/accounts/:id ────────────────────────────────────────────
smtpRouter.delete("/api/smtp/accounts/:id", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);

  const [existing] = await db.select().from(smtpAccounts).where(and(eq(smtpAccounts.id, id), eq(smtpAccounts.userId, userId)));
  if (!existing) return void res.status(404).json({ message: "Not found" });

  await db.delete(smtpAccounts).where(eq(smtpAccounts.id, id));
  res.json({ ok: true });
});

// ── GET /api/smtp/mappings ────────────────────────────────────────────────────
smtpRouter.get("/api/smtp/mappings", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const mappings = await db.select().from(domainAccountMap).where(eq(domainAccountMap.userId, userId));
  res.json({ mappings });
});

// ── POST /api/smtp/mappings ───────────────────────────────────────────────────
const mappingSchema = z.object({
  domain:            z.string().min(1),
  primaryAccountId:  z.number().int().positive(),
  fallbackAccountId: z.number().int().positive().optional(),
});

smtpRouter.post("/api/smtp/mappings", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const [mapping] = await db.insert(domainAccountMap).values({ userId, ...parsed.data }).returning();
  res.status(201).json({ mapping });
});

// ── PATCH /api/smtp/mappings/:id ──────────────────────────────────────────────
smtpRouter.patch("/api/smtp/mappings/:id", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);

  const patch = mappingSchema.partial().parse(req.body);
  const [updated] = await db.update(domainAccountMap)
    .set(patch)
    .where(and(eq(domainAccountMap.id, id), eq(domainAccountMap.userId, userId)))
    .returning();
  if (!updated) return void res.status(404).json({ message: "Not found" });
  res.json({ mapping: updated });
});

// ── DELETE /api/smtp/mappings/:id ─────────────────────────────────────────────
smtpRouter.delete("/api/smtp/mappings/:id", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);

  const [existing] = await db.select().from(domainAccountMap).where(and(eq(domainAccountMap.id, id), eq(domainAccountMap.userId, userId)));
  if (!existing) return void res.status(404).json({ message: "Not found" });

  await db.delete(domainAccountMap).where(eq(domainAccountMap.id, id));
  res.json({ ok: true });
});

// ── POST /api/smtp/accounts/:id/test ─────────────────────────────────────────
smtpRouter.post("/api/smtp/accounts/:id/test", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);

  const [account] = await db.select().from(smtpAccounts).where(and(eq(smtpAccounts.id, id), eq(smtpAccounts.userId, userId)));
  if (!account) return void res.status(404).json({ message: "Not found" });

  try {
    const nodemailer = await import("nodemailer");
    const pass = account.smtpPass ? decrypt(account.smtpPass) : undefined;
    const transport = nodemailer.createTransport({
      host:   account.smtpHost ?? undefined,
      port:   account.smtpPort ?? 587,
      secure: (account.smtpPort ?? 587) === 465,
      auth: account.smtpUser ? { user: account.smtpUser, pass } : undefined,
    });
    await transport.verify();
    res.json({ ok: true, message: "Connection verified" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(smtpAccounts).set({ lastError: msg, degradedAt: new Date() }).where(eq(smtpAccounts.id, id));
    res.status(400).json({ ok: false, message: msg });
  }
});

// ── POST /api/smtp/mappings/auto-assign ───────────────────────────────────────
// Assigns Mailcow domains to SMTP accounts round-robin.
// Body: { domains: string[] }  — list of Mailcow domain names
smtpRouter.post("/api/smtp/mappings/auto-assign", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = z.object({ domains: z.array(z.string().min(1)).min(1) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const domainList = parsed.data.domains;

  const accounts = await db.select().from(smtpAccounts).where(eq(smtpAccounts.userId, userId));
  if (accounts.length === 0) return void res.status(400).json({ message: "No SMTP accounts found. Add at least one account first." });

  const existing = await db.select().from(domainAccountMap).where(eq(domainAccountMap.userId, userId));
  const alreadyMapped = new Set(existing.map((m) => m.domain));

  const toAssign = domainList.filter((d) => !alreadyMapped.has(d));
  if (toAssign.length === 0) return void res.json({ assigned: 0, skipped: domainList.length, message: "All domains already have mappings." });

  let idx = 0;
  const inserted: typeof domainAccountMap.$inferSelect[] = [];
  for (const domain of toAssign) {
    const account = accounts[idx % accounts.length];
    idx++;
    try {
      const [row] = await db
        .insert(domainAccountMap)
        .values({ userId, domain, primaryAccountId: account.id, fallbackAccountId: null })
        .onConflictDoNothing()
        .returning();
      if (row) inserted.push(row);
    } catch {
      // skip conflicts
    }
  }

  res.json({ assigned: inserted.length, skipped: alreadyMapped.size, message: `Assigned ${inserted.length} domain${inserted.length !== 1 ? "s" : ""} to SMTP accounts.` });
});

// ── PUT /api/smtp/mappings/domain/:domain ─────────────────────────────────────
// Upsert: set or clear the primary account for a domain
smtpRouter.put("/api/smtp/mappings/domain/:domain", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const domain = req.params.domain;
  const { primaryAccountId } = z.object({ primaryAccountId: z.number().int().positive().nullable() }).parse(req.body);

  if (primaryAccountId === null) {
    // Clear mapping
    await db.delete(domainAccountMap).where(and(eq(domainAccountMap.userId, userId), eq(domainAccountMap.domain, domain)));
    return void res.json({ ok: true, cleared: true });
  }

  const [existing] = await db.select().from(domainAccountMap).where(and(eq(domainAccountMap.userId, userId), eq(domainAccountMap.domain, domain)));
  if (existing) {
    const [updated] = await db.update(domainAccountMap).set({ primaryAccountId }).where(eq(domainAccountMap.id, existing.id)).returning();
    return void res.json({ mapping: updated });
  }
  const [inserted] = await db.insert(domainAccountMap).values({ userId, domain, primaryAccountId, fallbackAccountId: null }).returning();
  res.status(201).json({ mapping: inserted });
});

// ── GET /api/smtp/relay/credentials ───────────────────────────────────────────
smtpRouter.get("/api/smtp/relay/credentials", (_req: Request, res: Response) => {
  const secret = process.env.SMTP_RELAY_SECRET ?? "lf-relay-secret";
  res.json({
    host: "127.0.0.1",
    port: 2525,
    username: "relay",
    password: secret,
    note: "Configure Mailcow → System → Configuration → Relayhost to use these credentials.",
  });
});

// ── GET /api/smtp/relay/stats ─────────────────────────────────────────────────
smtpRouter.get("/api/smtp/relay/stats", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const { relayLogs } = await import("../shared/schema.js");
  const { sql } = await import("drizzle-orm");
  const rows = await db.select({
    status: relayLogs.status,
    count:  sql<number>`cast(count(*) as int)`,
  }).from(relayLogs).groupBy(relayLogs.status);

  const stats = { ok: 0, failed: 0, fallback: 0 };
  for (const r of rows) {
    if (r.status === "ok" || r.status === "failed" || r.status === "fallback") {
      stats[r.status] = r.count;
    }
  }
  res.json({ stats });
});

// ── Export decrypt helper for relay service ───────────────────────────────────
export { decrypt };
