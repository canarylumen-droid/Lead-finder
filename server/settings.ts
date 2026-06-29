/**
 * App-level settings stored in the database (key/value).
 * Used for: relay secret generation, future config.
 */
import { randomBytes } from "crypto";
import { db } from "./db.js";
import { appSettings } from "../shared/schema.js";
import { eq } from "drizzle-orm";

let _cachedRelaySecret: string | null = null;

export async function getRelaySecret(): Promise<string> {
  if (_cachedRelaySecret) return _cachedRelaySecret;

  // Env var always wins (backwards compat for existing deployments)
  if (process.env.SMTP_RELAY_SECRET) {
    _cachedRelaySecret = process.env.SMTP_RELAY_SECRET;
    // Also persist so UI can show it
    await db.insert(appSettings)
      .values({ key: "relay_secret", value: _cachedRelaySecret })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: _cachedRelaySecret } })
      .catch(() => {});
    return _cachedRelaySecret;
  }

  // Try DB
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "relay_secret"));
  if (row) {
    _cachedRelaySecret = row.value;
    return _cachedRelaySecret;
  }

  // Generate and persist
  return regenerateRelaySecret();
}

export async function regenerateRelaySecret(): Promise<string> {
  const secret = `lf-${randomBytes(18).toString("base64url")}`;
  await db.insert(appSettings)
    .values({ key: "relay_secret", value: secret })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: secret } });
  _cachedRelaySecret = secret;
  return secret;
}
