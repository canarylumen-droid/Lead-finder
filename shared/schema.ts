import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  username: text("username").notNull(),
  profileUrl: text("profile_url"),
  followerCount: integer("follower_count"),
  bio: text("bio"),
  email: text("email"),
  name: text("name"),
  title: text("title"),
  company: text("company"),
  companySize: text("company_size"),
  isQualified: boolean("is_qualified").default(false),
  relevanceScore: integer("relevance_score").default(0),
  queryUsed: text("query_used").notNull(),
  scrapedAt: timestamp("scraped_at").defaultNow(),
  metadata: jsonb("metadata"),
});

export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("pending"),
  platform: text("platform").notNull(),
  query: text("query").notNull(),
  offering: text("offering").notNull(),
  quantity: integer("quantity").notNull(),
  processedCount: integer("processed_count").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ 
  id: true, 
  scrapedAt: true 
});

export const insertScrapeJobSchema = createInsertSchema(scrapeJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  processedCount: true,
  errorMessage: true,
  status: true,
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;

export const scrapeRequestSchema = z.object({
  platform: z.enum(["instagram", "linkedin", "both"]),
  query: z.string().min(1, "Search query is required"),
  quantity: z.number().min(1).max(100).default(10),
  offering: z.string().min(1, "Offering description is required"),
});

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;
