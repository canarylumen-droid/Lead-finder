import * as cheerio from "cheerio";
import { promises as dns } from "dns";

const SKIP_PATTERNS = [
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "bounce", "mailer-daemon", "postmaster", "unsubscribe",
  "spam", "abuse", "listserv", "notifications@", "alerts@",
];

const SKIP_DOMAINS = [
  "sentry.io","sentry-cdn.com","google.com","googleapis.com",
  "facebook.com","twitter.com","instagram.com","linkedin.com",
  "cloudflare.com","amazonaws.com","w3.org","schema.org",
  "example.com","yourdomain.com","domain.com","email.com",
  "wixpress.com","squarespace.com","mailchimp.com","constantcontact.com",
  "wordpress.com","godaddy.com","namecheap.com","sendgrid.net",
  "mailgun.org","zendesk.com","intercom.io","hubspot.com",
  "temp-mail.org","mailinator.com","guerrillamail.com","yopmail.com",
  "10minutemail.com","throwam.com","sharklasers.com","guerrillamailblock.com",
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Cache-Control": "no-cache",
};

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return false;
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  if (!local || !domain) return false;
  if (SKIP_PATTERNS.some((p) => lower.startsWith(p) || local === p.replace("@", ""))) return false;
  if (SKIP_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  if (local.match(/\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf|eot|ico|webp|pdf|zip)$/)) return false;
  if (local.length < 2 || local.length > 64) return false;
  // Must have valid TLD (2-6 chars, letters only)
  const tld = domain.split(".").pop() ?? "";
  if (!/^[a-z]{2,6}$/.test(tld)) return false;
  return true;
}

function extractEmailsFromHtml(html: string): string[] {
  const $ = cheerio.load(html);

  // Priority 1: explicit mailto: links — most reliable for business contacts
  const mailtoEmails: string[] = [];
  $('a[href^="mailto:"], a[href^="MAILTO:"]').each((_, el) => {
    const href  = $(el).attr("href") || "";
    const email = href.replace(/^mailto:/i, "").split(/[?#]/)[0].trim().toLowerCase();
    if (isValidEmail(email)) mailtoEmails.push(email);
  });
  if (mailtoEmails.length > 0) return mailtoEmails;

  // Priority 2: JSON-LD structured data (schema.org ContactPoint, Organization)
  const jsonLdEmails: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}");
      const extract = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        if (obj.email && isValidEmail(obj.email)) jsonLdEmails.push(obj.email.toLowerCase());
        if (obj.contactPoint?.email && isValidEmail(obj.contactPoint.email))
          jsonLdEmails.push(obj.contactPoint.email.toLowerCase());
        for (const v of Object.values(obj)) extract(v);
      };
      extract(data);
    } catch {}
  });
  if (jsonLdEmails.length > 0) return [...new Set(jsonLdEmails)];

  // Priority 3: page text with scripts/styles removed
  $("script, style, noscript, code, pre, header, footer, nav").remove();
  const text = $.html();
  const matches = text.match(EMAIL_REGEX) || [];
  return Array.from(new Set(matches.map((e) => e.toLowerCase()).filter(isValidEmail)));
}

async function fetchPage(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);
    const res        = await fetch(url, {
      signal:   controller.signal,
      headers:  FETCH_HEADERS,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text")) return null;
    const buf = await res.arrayBuffer();
    return new TextDecoder().decode(buf.slice(0, 256_000)); // 256KB cap — fast
  } catch {
    return null;
  }
}

// All common contact/about paths — covers 99% of small business sites
const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/reach-us",
  "/get-in-touch",
  "/info",
  "/email",
  "/support",
  "/team",
  "/staff",
  "/help",
];

export async function findEmailForBusiness(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null;

  let base: URL;
  try {
    base = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
  } catch {
    return null;
  }

  const origin = base.origin;

  // Fetch homepage + first 5 contact paths all in parallel for maximum speed
  const priorityUrls = [origin, ...CONTACT_PATHS.slice(0, 5).map((p) => `${origin}${p}`)];

  const results = await Promise.allSettled(priorityUrls.map((u) => fetchPage(u, 4000)));

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const emails = extractEmailsFromHtml(result.value);
      if (emails.length > 0) return emails[0];
    }
  }

  // Second pass — remaining paths sequentially (only if first pass failed)
  for (const path of CONTACT_PATHS.slice(5)) {
    const html = await fetchPage(`${origin}${path}`, 3000);
    if (html) {
      const emails = extractEmailsFromHtml(html);
      if (emails.length > 0) return emails[0];
    }
  }

  return null;
}

/** Soft DNS validation — checks domain has active mail servers */
export async function hasMXRecord(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}
