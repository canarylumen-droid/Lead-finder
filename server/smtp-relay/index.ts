/**
 * SMTP Relay Multiplexer
 * Listens on 127.0.0.1:2525
 * Routes outbound mail based on the MAIL FROM domain to configured upstream SMTP accounts.
 */
import { SMTPServer } from "smtp-server";
import nodemailer from "nodemailer";
import { db } from "../db.js";
import { domainAccountMap, smtpAccounts, relayLogs } from "../../shared/schema.js";
import { inArray } from "drizzle-orm";
import { decrypt } from "../crypto-utils.js";
import type Mail from "nodemailer/lib/mailer/index.js";

interface RouteEntry {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  accountId: number;
  isFallback: boolean;
}

// Optimized routing cache
const routeCache = new Map<string, RouteEntry[]>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 300_000; // 5 minutes

async function loadRoutes(): Promise<void> {
  try {
    const maps = await db.select().from(domainAccountMap);
    if (maps.length === 0) {
      routeCache.clear();
      return;
    }

    const accountIds = Array.from(new Set(
      maps.flatMap((m) => [m.primaryAccountId, m.fallbackAccountId]).filter((id): id is number => id !== null)
    ));

    const accounts = await db.select().from(smtpAccounts).where(inArray(smtpAccounts.id, accountIds));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    routeCache.clear();
    for (const map of maps) {
      const routes: RouteEntry[] = [];
      
      const addRoute = (accountId: number | null, isFallback: boolean) => {
        if (accountId === null) return;
        const acct = accountMap.get(accountId);
        if (acct?.smtpHost && acct.smtpUser && acct.smtpPass) {
          routes.push({
            smtpHost: acct.smtpHost,
            smtpPort: acct.smtpPort ?? 587,
            smtpUser: acct.smtpUser,
            smtpPass: decrypt(acct.smtpPass),
            accountId: acct.id,
            isFallback,
          });
        }
      };

      addRoute(map.primaryAccountId, false);
      addRoute(map.fallbackAccountId, true);

      if (routes.length > 0) {
        routeCache.set(map.domain.toLowerCase(), routes);
      }
    }
    cacheLoadedAt = Date.now();
    console.log(`[relay] Route cache reloaded: ${routeCache.size} domain(s) configured.`);
  } catch (error) {
    console.error("[relay] Failed to load routes:", error);
  }
}

async function resolveRoute(domain: string): Promise<RouteEntry[] | null> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) await loadRoutes();
  return routeCache.get(domain.toLowerCase()) ?? null;
}

async function logRelay(domain: string, accountId: number | null, status: "ok" | "failed" | "fallback", error?: string) {
  try {
    await db.insert(relayLogs).values({ domain, accountId, status, error: error ?? null });
  } catch (err) {
    console.error("[relay] Failed to log relay activity:", err);
  }
}

export function startRelayServer(): void {
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onConnect(session, cb) {
      const allowed = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
      if (!allowed.includes(session.remoteAddress)) {
        return cb(new Error("Connection refused: access denied"));
      }
      cb();
    },
    async onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const raw = Buffer.concat(chunks);

      const senderAddr = (session.envelope?.mailFrom as { address: string } | undefined)?.address || "";
      const domain = senderAddr.split("@").pop()?.toLowerCase() || "";

      if (!domain) {
        return cb(new Error("Missing sender domain"));
      }

      const routes = await resolveRoute(domain);
      if (!routes) {
        await logRelay(domain, null, "failed", "No route found");
        return cb(new Error(`No route for: ${domain}`));
      }

      let lastError = "";
      for (const route of routes) {
        try {
          const transport = nodemailer.createTransport({
            host: route.smtpHost,
            port: route.smtpPort,
            secure: route.smtpPort === 465,
            auth: { user: route.smtpUser, pass: route.smtpPass },
            pool: true,
            connectionTimeout: 10000,
          });

          const recipients = session.envelope.rcptTo.map((r: { address: string }) => r.address);

          await transport.sendMail({
            envelope: { from: senderAddr, to: recipients },
            raw,
          } as Mail.Options);

          await logRelay(domain, route.accountId, route.isFallback ? "fallback" : "ok");
          return cb(null, "Message accepted");
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.error(`[relay] Route failed (Account ${route.accountId}): ${lastError}`);
        }
      }

      await logRelay(domain, null, "failed", lastError);
      cb(new Error(`Upstream relay failed: ${lastError}`));
    },
  });

  server.listen(2525, "127.0.0.1", () => {
    console.log("[relay] SMTP multiplexer active on 127.0.0.1:2525");
  });

  server.on("error", (err: any) => console.error("[relay] Server error:", err));
  loadRoutes().catch(console.error);
}
