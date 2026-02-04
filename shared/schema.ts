import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Leads table with deduplication hash
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
  businessType: text("business_type"), // agency / coach / fitness / unknown
  contextSummary: text("context_summary"), // AI-generated summary
  isQualified: boolean("is_qualified").default(false),
  relevanceScore: integer("relevance_score").default(0),
  queryUsed: text("query_used").notNull(),
  jobId: integer("job_id"),
  dedupeHash: text("dedupe_hash").notNull(), // hash(email + source)
  scrapedAt: timestamp("scraped_at").defaultNow(),
  metadata: jsonb("metadata"),
}, (table) => ({
  dedupeHashIdx: uniqueIndex("dedupe_hash_idx").on(table.dedupeHash),
}));

// Jobs table with enhanced tracking
export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("queued"), // queued | running | completed | failed | cancelled
  platform: text("platform").notNull(),
  query: text("query").notNull(),
  offering: text("offering").notNull(),
  quantity: integer("quantity").notNull(),
  processedCount: integer("processed_count").default(0),
  qualifiedCount: integer("qualified_count").default(0),
  duplicatesSkipped: integer("duplicates_skipped").default(0),
  activeWorkers: integer("active_workers").default(0),
  totalWorkers: integer("total_workers").default(20),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// Job logs for real-time streaming
export const jobLogs = pgTable("job_logs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  workerId: integer("worker_id"),
  level: text("level").notNull().default("info"), // info | warn | error | success
  message: text("message").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Deduplication tracking
export const dedupeHashes = pgTable("dedupe_hashes", {
  id: serial("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  leadId: integer("lead_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  scrapedAt: true
});

export const insertScrapeJobSchema = createInsertSchema(scrapeJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  processedCount: true,
  qualifiedCount: true,
  duplicatesSkipped: true,
  activeWorkers: true,
  errorMessage: true,
  status: true,
});

export const insertJobLogSchema = createInsertSchema(jobLogs).omit({
  id: true,
  createdAt: true,
});

// Types
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;
export type JobLog = typeof jobLogs.$inferSelect;
export type InsertJobLog = z.infer<typeof insertJobLogSchema>;

// Request schemas
export const scrapeRequestSchema = z.object({
  platform: z.enum(["instagram", "linkedin", "both"]),
  query: z.string().min(1, "Search query is required"),
  quantity: z.number().min(1).max(1000).default(10),
  offering: z.string().min(1, "Offering description is required"),
});

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  qualified: z.enum(["all", "qualified", "unqualified"]).default("all"),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

// Job stats for real-time updates
export interface JobStats {
  jobId: number;
  status: string;
  processedCount: number;
  qualifiedCount: number;
  duplicatesSkipped: number;
  activeWorkers: number;
  totalWorkers: number;
}

// Log entry for streaming
export interface LogEntry {
  id: number;
  jobId: number;
  workerId?: number;
  level: string;
  message: string;
  data?: any;
  timestamp: string;
}
