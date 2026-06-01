import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  niches: text("niches").notNull(),         // JSON string[]
  cities: text("cities").notNull(),          // JSON string[]
  country: text("country").notNull(),        // JSON string[] of selected countries
  maxReviews: integer("max_reviews").notNull().default(40),
  targetVolume: integer("target_volume").notNull().default(500),
  includePhone: integer("include_phone").notNull().default(1), // 1=yes 0=no
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
  emailVerified: integer("email_verified").default(0), // 0=unknown 1=has_mx
  mapsUrl: text("maps_url"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
}, (t) => ({
  sessionIdx: uniqueIndex("leads_session_name_city_idx").on(t.sessionId, t.name, t.city),
}));

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, scrapedAt: true });
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

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
