import * as cheerio from "cheerio";
import { promises as dns } from "dns";

const SKIP_PATTERNS = [
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "bounce", "mailer-daemon", "postmaster", "unsubscribe",
  "spam", "abuse", "listserv", "notifications@",
];

const SKIP_DOMAINS = [
  "sentry.io", "sentry-cdn.com", "google.com", "googleapis.com",
  "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
  "cloudflare.com", "amazonaws.com", "w3.org", "schema.org",
  "example.com", "yourdomain.com", "domain.com", "email.com",
  "wixpress.com", "squarespace.com",
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return false;
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  if (SKIP_PATTERNS.some((p) => local.includes(p))) return false;
  if (SKIP_DOMAINS.some((d) => domain.includes(d))) return false;
  if (local.match(/\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf|eot|ico|webp)$/)) return false;
  if (local.length < 1 || local.length > 64) return false;
  return true;
}

function extractEmailsFromHtml(html: string): string[] {
  const $ = cheerio.load(html);

  // Priority 1: explicit mailto: links — most reliable
  const mailtoEmails: string[] = [];
  $('a[href^="mailto:"], a[href^="MAILTO:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const email = href.replace(/^mailto:/i, "").split(/[?#]/)[0].trim().toLowerCase();
    if (isValidEmail(email)) mailtoEmails.push(email);
  });
  if (mailtoEmails.length > 0) return mailtoEmails;

  // Priority 2: page text (remove scripts/styles to cut false positives)
  $("script, style, noscript, code, pre").remove();
  const text = $.html();
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches.map((e) => e.toLowerCase()).filter(isValidEmail))];
}

async function fetchPage(url: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text")) return null;
    // Cap at 500KB — avoids slow downloads of huge pages
    const buf = await res.arrayBuffer();
    return new TextDecoder().decode(buf.slice(0, 512_000));
  } catch {
    return null;
  }
}

export async function findEmailForBusiness(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null;

  let base: URL;
  try {
    base = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
  } catch {
    return null;
  }

  const origin = base.origin;

  // 1. Homepage
  const html = await fetchPage(origin);
  if (html) {
    const emails = extractEmailsFromHtml(html);
    if (emails.length > 0) return emails[0];
  }

  // 2. Common contact/about pages
  for (const path of ["/contact", "/contact-us", "/about", "/about-us", "/reach-us", "/get-in-touch"]) {
    const pageHtml = await fetchPage(`${origin}${path}`, 5000);
    if (pageHtml) {
      const emails = extractEmailsFromHtml(pageHtml);
      if (emails.length > 0) return emails[0];
    }
  }

  return null;
}

/** Soft DNS validation — checks domain actually has mail servers */
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
