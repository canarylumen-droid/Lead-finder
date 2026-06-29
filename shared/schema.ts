import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// ── Scrape Sessions ───────────────────────────────────────────────────────────
export const scrapeSessions = pgTable("scrape_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  niches: text("niches").notNull(),
  cities: text("cities").notNull(),
  country: text("country").notNull(),
  maxReviews: integer("max_reviews").notNull().default(40),
  targetVolume: integer("target_volume").notNull().default(500),
  includePhone: integer("include_phone").notNull().default(1),
  status: text("status").notNull().default("running"),
  leadsCount: integer("leads_count").notNull().default(0),
  emailCount: integer("email_count").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});
export const insertSessionSchema = createInsertSchema(scrapeSessions).omit({
  id: true, startedAt: true, completedAt: true,
  status: true, leadsCount: true, emailCount: true, errorMessage: true,
});
export type ScrapeSession = typeof scrapeSessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

// ── Leads ─────────────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  niche: text("niche").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  website: text("website"),
  rating: text("rating"),
  reviewsCount: integer("reviews_count"),
  address: text("address"),
  email: text("email"),
  emailVerified: integer("email_verified").default(0),
  mapsUrl: text("maps_url"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
}, (t) => ({
  sessionIdx: uniqueIndex("leads_session_name_city_idx").on(t.sessionId, t.name, t.city),
  userNameCityIdx: index("leads_user_name_city_idx").on(t.userId, t.name, t.city),
}));
export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, scrapedAt: true });
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

// ── SMTP Providers (canonical list, seeded) ────────────────────────────────────
export const smtpProviders = pgTable("smtp_providers", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUserTemplate: text("smtp_user_template"),
  spfInclude: text("spf_include"),
  dkimSelector: text("dkim_selector"),
  apiBase: text("api_base"),
  docsUrl: text("docs_url"),
  hasApiFetch: integer("has_api_fetch").default(0),
  color: text("color"),
});
export type SmtpProvider = typeof smtpProviders.$inferSelect;

// ── SMTP Accounts (user's keys per provider) ──────────────────────────────────
export const smtpAccounts = pgTable("smtp_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  providerId: integer("provider_id").notNull(),
  label: text("label").notNull(),
  apiKey: text("api_key"),        // AES-256 encrypted
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),    // AES-256 encrypted
  isActive: integer("is_active").notNull().default(1),
  lastError: text("last_error"),
  degradedAt: timestamp("degraded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertSmtpAccountSchema = createInsertSchema(smtpAccounts).omit({ id: true, createdAt: true, degradedAt: true, lastError: true });
export type SmtpAccount = typeof smtpAccounts.$inferSelect;
export type InsertSmtpAccount = z.infer<typeof insertSmtpAccountSchema>;

// ── Domain → Account Mapping ──────────────────────────────────────────────────
export const domainAccountMap = pgTable("domain_account_map", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  domain: text("domain").notNull(),
  primaryAccountId: integer("primary_account_id").notNull(),
  fallbackAccountId: integer("fallback_account_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type DomainAccountMap = typeof domainAccountMap.$inferSelect;

// ── Mailcow Config ────────────────────────────────────────────────────────────
export const mailcowConfig = pgTable("mailcow_config", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  relayConfigured: integer("relay_configured").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type MailcowConfig = typeof mailcowConfig.$inferSelect;

// ── DNS Records ───────────────────────────────────────────────────────────────
export const dnsRecords = pgTable("dns_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  domain: text("domain").notNull(),
  recordType: text("record_type").notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  ttl: integer("ttl").default(3600),
  provider: text("provider"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type DnsRecord = typeof dnsRecords.$inferSelect;

// ── Relay Logs ────────────────────────────────────────────────────────────────
export const relayLogs = pgTable("relay_logs", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  accountId: integer("account_id"),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type RelayLog = typeof relayLogs.$inferSelect;

// ── App Settings (key/value) ──────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── API Schemas ───────────────────────────────────────────────────────────────
export const launchSessionSchema = z.object({
  niches: z.array(z.string().min(1)).min(1),
  cities: z.array(z.string().min(1)).min(1),
  countries: z.array(z.string().min(1)).min(1),
  cityCountryMap: z.record(z.string(), z.string()),
  maxReviews: z.number().int().min(0).max(100000).default(40),
  targetVolume: z.number().int().min(1).max(500000).default(500),
  includePhone: z.number().int().min(0).max(1).default(1),
});
export type LaunchSessionInput = z.infer<typeof launchSessionSchema>;
