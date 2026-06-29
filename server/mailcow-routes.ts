import { Router, type Request, type Response } from "express";
import { db } from "./db.js";
import { mailcowConfig } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto-utils.js";
import { z } from "zod";

export const mailcowRouter = Router();

function requireUser(req: Request, res: Response): number | null {
  const raw = req.headers["x-user-id"];
  const id  = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (isNaN(id)) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return id;
}

async function mailcowFetch(baseUrl: string, apiKey: string, path: string, method = "GET", body?: unknown) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const r = await fetch(url, {
    method,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new Error(`Mailcow ${method} ${path} → ${r.status}: ${text}`);
  }
  return r.json();
}

function getConfig(userId: number) {
  return db.select().from(mailcowConfig).where(eq(mailcowConfig.userId, userId)).then((r) => r[0] ?? null);
}

// ── GET /api/mailcow/config ───────────────────────────────────────────────────
mailcowRouter.get("/api/mailcow/config", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const cfg = await getConfig(userId);
  if (!cfg) return void res.json({ config: null });
  res.json({ config: { id: cfg.id, baseUrl: cfg.baseUrl, relayConfigured: cfg.relayConfigured, apiKey: "••••••••" } });
});

// ── PUT /api/mailcow/config ───────────────────────────────────────────────────
const configSchema = z.object({
  baseUrl: z.string().url(),
  apiKey:  z.string().min(1),
});

mailcowRouter.put("/api/mailcow/config", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const { baseUrl, apiKey } = parsed.data;

  // Verify connectivity
  try {
    await mailcowFetch(baseUrl, apiKey, "/api/v1/get/status/containers");
  } catch (err: unknown) {
    return void res.status(400).json({ message: `Cannot reach Mailcow: ${(err as Error).message}` });
  }

  const enc = encrypt(apiKey);
  const existing = await getConfig(userId);

  let cfg;
  if (existing) {
    [cfg] = await db.update(mailcowConfig)
      .set({ baseUrl, encryptedApiKey: enc, updatedAt: new Date() })
      .where(eq(mailcowConfig.userId, userId))
      .returning();
  } else {
    [cfg] = await db.insert(mailcowConfig)
      .values({ userId, baseUrl, encryptedApiKey: enc })
      .returning();
  }

  res.json({ config: { id: cfg.id, baseUrl: cfg.baseUrl, relayConfigured: cfg.relayConfigured, apiKey: "••••••••" } });
});

// ── GET /api/mailcow/domains ──────────────────────────────────────────────────
mailcowRouter.get("/api/mailcow/domains", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/get/domain/all");
  res.json({ domains: data });
});

// ── POST /api/mailcow/domains ─────────────────────────────────────────────────
mailcowRouter.post("/api/mailcow/domains", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const schema = z.object({
    domain:   z.string().min(1),
    active:   z.number().int().default(1),
    restart_sogo: z.number().int().default(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/add/domain", "POST", parsed.data);
  res.json(data);
});

// ── DELETE /api/mailcow/domains/:domain ──────────────────────────────────────
mailcowRouter.delete("/api/mailcow/domains/:domain", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/delete/domain", "POST", [req.params.domain]);
  res.json(data);
});

// ── GET /api/mailcow/mailboxes ────────────────────────────────────────────────
mailcowRouter.get("/api/mailcow/mailboxes", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/get/mailbox/all");
  res.json({ mailboxes: data });
});

// ── POST /api/mailcow/mailboxes ───────────────────────────────────────────────
mailcowRouter.post("/api/mailcow/mailboxes", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const schema = z.object({
    local_part:   z.string().min(1),
    domain:       z.string().min(1),
    name:         z.string().default(""),
    password:     z.string().min(8),
    password2:    z.string().min(8),
    quota:        z.number().int().default(1024),
    active:       z.number().int().default(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/add/mailbox", "POST", parsed.data);
  res.json(data);
});

// ── DELETE /api/mailcow/mailboxes/:email ──────────────────────────────────────
mailcowRouter.delete("/api/mailcow/mailboxes/:email", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/delete/mailbox", "POST", [req.params.email]);
  res.json(data);
});

// ── GET /api/mailcow/dkim/:domain ─────────────────────────────────────────────
mailcowRouter.get("/api/mailcow/dkim/:domain", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, `/api/v1/get/dkim/${req.params.domain}`);
  res.json(data);
});

// ── POST /api/mailcow/dkim ────────────────────────────────────────────────────
mailcowRouter.post("/api/mailcow/dkim", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const schema = z.object({ domain: z.string().min(1), dkim_selector: z.string().default("dkim"), key_size: z.number().int().default(2048) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const apiKey = decrypt(cfg.encryptedApiKey);
  const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/add/dkim", "POST", parsed.data);
  res.json(data);
});

// ── POST /api/mailcow/relay/configure ─────────────────────────────────────────
// Sets Mailcow to use our relay multiplexer at 127.0.0.1:2525
mailcowRouter.post("/api/mailcow/relay/configure", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  try {
    // Add transport map entry: all mail routes through our relay
    await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/add/relayhost", "POST", {
      hostname:  "127.0.0.1",
      port:      2525,
      username:  "",
      password:  "",
      active:    1,
    });

    await db.update(mailcowConfig)
      .set({ relayConfigured: 1, updatedAt: new Date() })
      .where(eq(mailcowConfig.userId, userId));

    res.json({ ok: true, message: "Relay host 127.0.0.1:2525 configured in Mailcow" });
  } catch (err: unknown) {
    res.status(400).json({ message: (err as Error).message });
  }
});

// ── POST /api/mailcow/mailboxes/set-password ──────────────────────────────────
// Bulk-set the same password on all mailboxes in Mailcow
mailcowRouter.post("/api/mailcow/mailboxes/set-password", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const { password } = z.object({ password: z.string().min(8) }).parse(req.body);
  const apiKey = decrypt(cfg.encryptedApiKey);

  const mailboxes = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/get/mailbox/all") as Array<{ username: string }>;
  let updated = 0;
  const errors: string[] = [];

  for (const mb of mailboxes) {
    try {
      await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/edit/mailbox", "POST", {
        items: [mb.username],
        attr:  { password, password2: password },
      });
      updated++;
    } catch (e: unknown) {
      errors.push(`${mb.username}: ${(e as Error).message}`);
    }
  }

  res.json({ updated, total: mailboxes.length, errors });
});

// ── POST /api/mailcow/sync-dns ────────────────────────────────────────────────
// Pull DKIM for every domain in Mailcow and save SPF/DKIM/DMARC to dns_records
mailcowRouter.post("/api/mailcow/sync-dns", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const { spfIncludes, dmarcEmail } = z.object({
    spfIncludes: z.array(z.string()).default([]),
    dmarcEmail:  z.string().email().optional(),
  }).parse(req.body);

  const apiKey  = decrypt(cfg.encryptedApiKey);
  const domains = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/get/domain/all") as Array<{ domain_name: string }>;

  const { dnsRecords } = await import("../shared/schema.js");
  const { and } = await import("drizzle-orm");

  let totalRecords = 0;
  const results: { domain: string; records: number; dkimOk: boolean }[] = [];

  const spfVal = spfIncludes.length
    ? `v=spf1 ${spfIncludes.map((s) => `include:${s}`).join(" ")} mx ~all`
    : "v=spf1 mx ~all";

  for (const { domain_name } of domains) {
    let dkimOk = false;
    const toInsert: {
      userId: number; domain: string; recordType: string;
      name: string; value: string; ttl: number; provider: null;
    }[] = [];

    // SPF
    toInsert.push({ userId, domain: domain_name, recordType: "TXT", name: domain_name, value: spfVal, ttl: 3600, provider: null });

    // DKIM from Mailcow
    try {
      const dkim = await mailcowFetch(cfg.baseUrl, apiKey, `/api/v1/get/dkim/${domain_name}`) as {
        dkim_txt?: string; dkim_selector?: string; dkim_public_key?: string;
      };
      if (dkim.dkim_txt && dkim.dkim_txt !== "none") {
        const selector = dkim.dkim_selector ?? "dkim";
        toInsert.push({
          userId, domain: domain_name, recordType: "TXT",
          name:  `${selector}._domainkey.${domain_name}`,
          value: dkim.dkim_txt.includes("v=DKIM1") ? dkim.dkim_txt : `v=DKIM1; k=rsa; p=${dkim.dkim_public_key ?? dkim.dkim_txt}`,
          ttl:   3600, provider: null,
        });
        dkimOk = true;
      }
    } catch { /* no DKIM yet */ }

    // DMARC
    const rua = dmarcEmail ? `; rua=mailto:${dmarcEmail}; ruf=mailto:${dmarcEmail}` : "";
    toInsert.push({ userId, domain: domain_name, recordType: "TXT", name: `_dmarc.${domain_name}`, value: `v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r${rua}; fo=1`, ttl: 3600, provider: null });

    // Upsert records
    let count = 0;
    for (const r of toInsert) {
      try {
        await db.insert(dnsRecords).values(r)
          .onConflictDoNothing()
          .execute();
        count++;
      } catch { /* skip */ }
    }
    totalRecords += count;
    results.push({ domain: domain_name, records: count, dkimOk });
  }

  res.json({ domains: domains.length, records: totalRecords, results });
});

// ── GET /api/mailcow/status ───────────────────────────────────────────────────
mailcowRouter.get("/api/mailcow/status", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const cfg = await getConfig(userId);
  if (!cfg) return void res.status(400).json({ message: "Mailcow not configured" });

  const apiKey = decrypt(cfg.encryptedApiKey);
  try {
    const data = await mailcowFetch(cfg.baseUrl, apiKey, "/api/v1/get/status/containers");
    res.json({ status: data, relayConfigured: cfg.relayConfigured });
  } catch (err: unknown) {
    res.status(400).json({ message: (err as Error).message });
  }
});
