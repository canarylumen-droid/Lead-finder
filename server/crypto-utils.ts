import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const KEY = scryptSync(process.env.SESSION_SECRET ?? "lead-finder-default-secret", "lf-smtp-salt-v1", 32);

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const c = createCipheriv("aes-256-cbc", KEY, iv);
  return iv.toString("hex") + ":" + Buffer.concat([c.update(text, "utf8"), c.final()]).toString("hex");
}

export function decrypt(ct: string): string {
  try {
    const [ivH, encH] = ct.split(":");
    const d = createDecipheriv("aes-256-cbc", KEY, Buffer.from(ivH, "hex"));
    return Buffer.concat([d.update(Buffer.from(encH, "hex")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
