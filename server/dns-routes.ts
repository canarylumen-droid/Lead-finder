import { Router, type Request, type Response } from "express";
import { db } from "./db.js";
import { dnsRecords } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

export const dnsRouter = Router();

function requireUser(req: Request, res: Response): number | null {
  const raw = req.headers["x-user-id"];
  const id  = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (isNaN(id)) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return id;
}

// ── GET /api/dns/records ──────────────────────────────────────────────────────
dnsRouter.get("/api/dns/records", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const domain = String(req.query.domain ?? "");
  const filter = domain
    ? and(eq(dnsRecords.userId, userId), eq(dnsRecords.domain, domain))
    : eq(dnsRecords.userId, userId);

  const records = await db.select().from(dnsRecords).where(filter);
  res.json({ records });
});

// ── POST /api/dns/records ─────────────────────────────────────────────────────
const recordSchema = z.object({
  domain:     z.string().min(1),
  recordType: z.enum(["TXT", "MX", "CNAME", "A", "AAAA"]),
  name:       z.string().min(1),
  value:      z.string().min(1),
  ttl:        z.number().int().default(3600),
  provider:   z.string().optional(),
});

dnsRouter.post("/api/dns/records", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ message: parsed.error.issues[0].message });

  const [record] = await db.insert(dnsRecords).values({ userId, ...parsed.data }).returning();
  res.status(201).json({ record });
});

// ── DELETE /api/dns/records/:id ───────────────────────────────────────────────
dnsRouter.delete("/api/dns/records/:id", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = parseInt(String(req.params.id), 10);

  const [existing] = await db.select().from(dnsRecords).where(and(eq(dnsRecords.id, id), eq(dnsRecords.userId, userId)));
  if (!existing) return void res.status(404).json({ message: "Not found" });

  await db.delete(dnsRecords).where(eq(dnsRecords.id, id));
  res.json({ ok: true });
});

// ── POST /api/dns/verify ──────────────────────────────────────────────────────
// Live DNS lookup to check if records are propagated
dnsRouter.post("/api/dns/verify", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const { domain, recordType } = z.object({ domain: z.string(), recordType: z.string() }).parse(req.body);

  try {
    const dns = await import("dns/promises");
    let found = false;

    if (recordType === "TXT") {
      const recs = await dns.resolveTxt(domain).catch(() => []);
      found = recs.length > 0;
    } else if (recordType === "MX") {
      const recs = await dns.resolveMx(domain).catch(() => []);
      found = recs.length > 0;
    } else if (recordType === "CNAME") {
      const recs = await dns.resolveCname(domain).catch(() => []);
      found = recs.length > 0;
    } else {
      const recs = await dns.resolve(domain, recordType as "A").catch(() => []);
      found = recs.length > 0;
    }

    if (found) {
      await db.update(dnsRecords)
        .set({ verifiedAt: new Date() })
        .where(and(eq(dnsRecords.userId, userId), eq(dnsRecords.domain, domain)));
    }

    res.json({ verified: found });
  } catch {
    res.json({ verified: false });
  }
});

// ── POST /api/dns/generate ────────────────────────────────────────────────────
// Generate standard SPF/DKIM/DMARC records for a domain
dnsRouter.post("/api/dns/generate", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const { domain, spfInclude, dkimSelector, dkimPublicKey, dmarcEmail } = z.object({
    domain:        z.string().min(1),
    spfInclude:    z.string().optional(),
    dkimSelector:  z.string().default("dkim"),
    dkimPublicKey: z.string().optional(),
    dmarcEmail:    z.string().email().optional(),
  }).parse(req.body);

  const records = [];

  // SPF
  const spfValue = spfInclude
    ? `v=spf1 include:${spfInclude} ~all`
    : `v=spf1 mx ~all`;

  records.push({ userId, domain, recordType: "TXT", name: domain, value: spfValue, ttl: 3600, provider: null });

  // DKIM
  if (dkimPublicKey) {
    records.push({
      userId,
      domain,
      recordType: "TXT",
      name:  `${dkimSelector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
      ttl:   3600,
      provider: null,
    });
  }

  // DMARC
  const dmarcValue = `v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r${dmarcEmail ? `; rua=mailto:${dmarcEmail}; ruf=mailto:${dmarcEmail}` : ""}; fo=1`;
  records.push({ userId, domain, recordType: "TXT", name: `_dmarc.${domain}`, value: dmarcValue, ttl: 3600, provider: null });

  // Insert all, skip conflicts
  const inserted = [];
  for (const r of records) {
    try {
      const [row] = await db.insert(dnsRecords).values(r).returning();
      inserted.push(row);
    } catch {
      // skip duplicates
    }
  }

  res.json({ records: inserted });
});

// ── POST /api/dns/push/hostinger ──────────────────────────────────────────────
// Push DNS records to Hostinger via their API
dnsRouter.post("/api/dns/push/hostinger", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const { domain, apiToken } = z.object({
    domain:   z.string().min(1),
    apiToken: z.string().min(1),
  }).parse(req.body);

  const records = await db.select().from(dnsRecords)
    .where(and(eq(dnsRecords.userId, userId), eq(dnsRecords.domain, domain)));

  if (records.length === 0) return void res.status(400).json({ message: "No DNS records found for this domain" });

  const results = [];
  for (const rec of records) {
    try {
      const body = {
        type:    rec.recordType,
        name:    rec.name,
        content: rec.value,
        ttl:     rec.ttl ?? 3600,
      };
      const r = await fetch(`https://api.hostinger.com/v1/dns/zone/${domain}/records`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      results.push({ record: rec.name, status: r.ok ? "ok" : `error:${r.status}` });
    } catch (err: unknown) {
      results.push({ record: rec.name, status: `failed:${(err as Error).message}` });
    }
  }

  res.json({ results });
});
