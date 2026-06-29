/**
 * SMTP Relay Multiplexer
 * Listens on 127.0.0.1:2525
 * Mailcow routes all outbound mail through this server.
 * Per the MAIL FROM domain → looks up domain_account_map → routes to the correct upstream.
 */
import SMTPServer from "smtp-server";
import nodemailer from "nodemailer";
import { db } from "../db.js";
import { domainAccountMap, smtpAccounts, relayLogs } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "../crypto-utils.js";
import type Mail from "nodemailer/lib/mailer/index.js";

const { SMTPServer: Server } = SMTPServer;

interface RouteEntry {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  accountId: number;
  isFallback: boolean;
}

// In-memory routing table: domain → route
const routeCache = new Map<string, RouteEntry>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

async function loadRoutes(): Promise<void> {
  const maps = await db.select().from(domainAccountMap);
  const accountIds = [...new Set([
    ...maps.map((m) => m.primaryAccountId),
    ...maps.map((m) => m.fallbackAccountId).filter(Boolean) as number[],
  ])];

  const accounts: Record<number, typeof smtpAccounts.$inferSelect> = {};
  for (const id of accountIds) {
    const [acct] = await db.select().from(smtpAccounts).where(eq(smtpAccounts.id, id));
    if (acct) accounts[id] = acct;
  }

  routeCache.clear();
  for (const map of maps) {
    const primary = accounts[map.primaryAccountId];
    if (!primary || !primary.smtpHost || !primary.smtpUser || !primary.smtpPass) continue;

    routeCache.set(map.domain, {
      smtpHost:  primary.smtpHost,
      smtpPort:  primary.smtpPort ?? 587,
      smtpUser:  primary.smtpUser,
      smtpPass:  decrypt(primary.smtpPass),
      accountId: primary.id,
      isFallback: false,
    });
  }

  cacheLoadedAt = Date.now();
  console.log(`[relay] Route cache loaded — ${routeCache.size} domain(s)`);
}

async function resolveRoute(domain: string): Promise<RouteEntry | null> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) await loadRoutes();
  return routeCache.get(domain) ?? null;
}

async function logRelay(domain: string, accountId: number | null, status: "ok" | "failed" | "fallback", error?: string) {
  await db.insert(relayLogs).values({ domain, accountId, status, error: error ?? null });
}

export function startRelayServer(): void {
  const server = new Server({
    // No auth required — only accept from localhost / Mailcow
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onConnect(session, cb) {
      const remote = session.remoteAddress;
      if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
        return cb(new Error("Connection refused: only localhost allowed"));
      }
      cb();
    },
    async onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(chunks);

      // Determine sender domain from envelope
      const from = session.envelope?.mailFrom;
      const senderAddr = typeof from === "object" && from !== null && "address" in from
        ? (from as { address: string }).address
        : "";
      const domain = senderAddr.includes("@") ? senderAddr.split("@")[1] : "";

      const route = await resolveRoute(domain).catch(() => null);
      if (!route) {
        await logRelay(domain, null, "failed", "No route configured for this domain");
        return cb(new Error(`No relay route for domain: ${domain}`));
      }

      try {
        const transport = nodemailer.createTransport({
          host:   route.smtpHost,
          port:   route.smtpPort,
          secure: route.smtpPort === 465,
          auth:   { user: route.smtpUser, pass: route.smtpPass },
        });

        const recipients = session.envelope.rcptTo.map((r: { address: string }) => r.address);

        await transport.sendMail({
          envelope: {
            from: senderAddr,
            to:   recipients,
          },
          raw,
        } as Mail.Options & { raw: Buffer });

        await logRelay(domain, route.accountId, route.isFallback ? "fallback" : "ok");
        cb();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await logRelay(domain, route.accountId, "failed", msg);
        cb(new Error(`Upstream relay failed: ${msg}`));
      }
    },
  });

  server.listen(2525, "127.0.0.1", () => {
    console.log("[relay] SMTP multiplexer listening on 127.0.0.1:2525");
  });

  server.on("error", (err: Error) => {
    console.error("[relay] Server error:", err.message);
  });

  // Load routes eagerly
  loadRoutes().catch((err: Error) => console.error("[relay] Initial route load failed:", err.message));
}
