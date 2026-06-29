import { Router, type Request, type Response } from "express";
import { db } from "./db.js";
import { smtpAccounts, smtpProviders, relayLogs } from "../shared/schema.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { decrypt } from "./crypto-utils.js";

export const analyticsRouter = Router();

function requireUser(req: Request, res: Response): number | null {
  const raw = req.headers["x-user-id"];
  const id = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (isNaN(id)) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return id;
}

interface AccountStats {
  accountId: number;
  label: string;
  provider: string;
  providerSlug: string;
  delivered: number;
  bounced: number;
  spam: number;
  opens: number;
  clicks: number;
  fromApi: boolean;
  error?: string;
}

async function fetchBrevoStats(apiKey: string, start: string, end: string) {
  try {
    const r = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/aggregated-report?startDate=${start}&endDate=${end}`,
      { headers: { "api-key": apiKey, accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return { error: `Brevo ${r.status}` };
    const d = await r.json() as {
      delivered?: number; softBounces?: number; hardBounces?: number;
      spam?: number; viewed?: number; clicks?: number;
    };
    return {
      delivered: d.delivered ?? 0,
      bounced:   (d.softBounces ?? 0) + (d.hardBounces ?? 0),
      spam:      d.spam    ?? 0,
      opens:     d.viewed  ?? 0,
      clicks:    d.clicks  ?? 0,
      fromApi:   true,
    };
  } catch (e) { return { error: (e as Error).message }; }
}

async function fetchSendgridStats(apiKey: string, start: string, end: string) {
  try {
    const r = await fetch(
      `https://api.sendgrid.com/v3/stats?start_date=${start}&end_date=${end}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return { error: `SendGrid ${r.status}` };
    const days = await r.json() as Array<{
      stats: Array<{ metrics: { delivered?: number; bounces?: number; spam_reports?: number; unique_opens?: number; unique_clicks?: number } }>;
    }>;
    let delivered = 0, bounced = 0, spam = 0, opens = 0, clicks = 0;
    for (const day of days) {
      for (const s of day.stats) {
        delivered += s.metrics.delivered ?? 0;
        bounced   += s.metrics.bounces ?? 0;
        spam      += s.metrics.spam_reports ?? 0;
        opens     += s.metrics.unique_opens ?? 0;
        clicks    += s.metrics.unique_clicks ?? 0;
      }
    }
    return { delivered, bounced, spam, opens, clicks, fromApi: true };
  } catch (e) { return { error: (e as Error).message }; }
}

async function fetchResendStats(_apiKey: string, _start: string, _end: string) {
  // Resend has no aggregate stats endpoint — relay logs are the best proxy
  return { error: "Resend has no stats API — relay log data shown" };
}

// ── GET /api/analytics/smtp ──────────────────────────────────────────────────
analyticsRouter.get("/api/analytics/smtp", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const { start, end } = req.query as { start?: string; end?: string };
  if (!start || !end) return void res.status(400).json({ message: "start and end dates required (YYYY-MM-DD)" });

  // Load accounts
  const accounts = await db.select({
    id: smtpAccounts.id, label: smtpAccounts.label,
    providerId: smtpAccounts.providerId, apiKey: smtpAccounts.apiKey,
  }).from(smtpAccounts).where(and(eq(smtpAccounts.userId, userId), eq(smtpAccounts.isActive, 1)));

  // Load providers
  const allProviders = await db.select().from(smtpProviders);
  const providerMap = Object.fromEntries(allProviders.map((p) => [p.id, p]));

  // Relay logs for the period (best effort when no provider API)
  const startTs  = new Date(start + "T00:00:00Z");
  const endTs    = new Date(end   + "T23:59:59Z");
  const relayRows = await db.select({
    accountId: relayLogs.accountId,
    status:    relayLogs.status,
    count:     sql<number>`cast(count(*) as int)`,
  }).from(relayLogs)
    .where(and(gte(relayLogs.createdAt, startTs), lte(relayLogs.createdAt, endTs)))
    .groupBy(relayLogs.accountId, relayLogs.status);

  const relayByAccount: Record<number, Record<string, number>> = {};
  for (const r of relayRows) {
    if (!r.accountId) continue;
    if (!relayByAccount[r.accountId]) relayByAccount[r.accountId] = {};
    relayByAccount[r.accountId][r.status] = r.count;
  }

  // Fetch stats per account (parallel)
  const results: AccountStats[] = await Promise.all(accounts.map(async (acct) => {
    const prov = providerMap[acct.providerId] ?? { name: "Custom", slug: "custom" };
    const relay = relayByAccount[acct.id] ?? {};
    const relayDelivered = (relay["ok"] ?? 0) + (relay["fallback"] ?? 0);
    const relayFailed    = relay["failed"] ?? 0;

    let apiStats: { delivered?: number; bounced?: number; spam?: number; opens?: number; clicks?: number; fromApi?: boolean; error?: string } = {};

    if (acct.apiKey) {
      const key = decrypt(acct.apiKey);
      switch (prov.slug) {
        case "brevo":    apiStats = await fetchBrevoStats(key, start, end);    break;
        case "sendgrid": apiStats = await fetchSendgridStats(key, start, end); break;
        case "resend":   apiStats = await fetchResendStats(key, start, end);   break;
        default: break;
      }
    }

    const fromApi = apiStats.fromApi ?? false;
    return {
      accountId:   acct.id,
      label:       acct.label,
      provider:    prov.name,
      providerSlug: prov.slug ?? "custom",
      delivered: apiStats.delivered ?? relayDelivered,
      bounced:   apiStats.bounced   ?? relayFailed,
      spam:      apiStats.spam      ?? 0,
      opens:     apiStats.opens     ?? 0,
      clicks:    apiStats.clicks    ?? 0,
      fromApi,
      error:     apiStats.error,
    };
  }));

  const totals = results.reduce(
    (acc, r) => ({
      delivered: acc.delivered + r.delivered,
      bounced:   acc.bounced   + r.bounced,
      spam:      acc.spam      + r.spam,
      opens:     acc.opens     + r.opens,
      clicks:    acc.clicks    + r.clicks,
    }),
    { delivered: 0, bounced: 0, spam: 0, opens: 0, clicks: 0 },
  );

  res.json({ accounts: results, totals, period: { start, end } });
});
