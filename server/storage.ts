import { db } from "./db";
import { leads, scrapeJobs, jobLogs, dedupeHashes, type InsertLead, type Lead, type InsertScrapeJob, type ScrapeJob, type InsertJobLog, type JobLog, type PaginationParams } from "@shared/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  // Leads
  createLead(lead: InsertLead): Promise<Lead | null>;
  createLeads(leadsData: InsertLead[]): Promise<Lead[]>;
  getLeads(params?: PaginationParams): Promise<{ leads: Lead[]; total: number; page: number; totalPages: number }>;
  getLead(id: number): Promise<Lead | undefined>;
  getLeadsByJob(jobId: number): Promise<Lead[]>;
  getStats(): Promise<{ total: number; qualified: number; averageScore: number }>;
  clearLeads(): Promise<void>;
  checkDuplicate(hash: string): Promise<boolean>;
  
  // Scrape Jobs
  createScrapeJob(job: InsertScrapeJob): Promise<ScrapeJob>;
  getScrapeJob(id: number): Promise<ScrapeJob | undefined>;
  getScrapeJobs(): Promise<ScrapeJob[]>;
  updateScrapeJobStatus(id: number, status: string, errorMessage?: string): Promise<ScrapeJob | undefined>;
  updateScrapeJobProgress(id: number, updates: Partial<Pick<ScrapeJob, 'processedCount' | 'qualifiedCount' | 'duplicatesSkipped' | 'activeWorkers'>>): Promise<void>;
  startScrapeJob(id: number): Promise<void>;
  completeScrapeJob(id: number): Promise<void>;
  
  // Job Logs
  addJobLog(log: InsertJobLog): Promise<JobLog>;
  getJobLogs(jobId: number, limit?: number): Promise<JobLog[]>;
}

// Generate dedupe hash from email + platform
export function generateDedupeHash(email: string | null | undefined, platform: string, username: string): string {
  const key = `${(email || '').toLowerCase()}-${platform}-${username.toLowerCase()}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

export class DatabaseStorage implements IStorage {
  async createLead(insertLead: InsertLead): Promise<Lead | null> {
    // Check for duplicate
    const isDuplicate = await this.checkDuplicate(insertLead.dedupeHash);
    if (isDuplicate) {
      console.log(`[Storage] Skipping duplicate lead: ${insertLead.email} - ${insertLead.dedupeHash}`);
      return null;
    }
    
    try {
      console.log(`[Storage] Creating lead: ${insertLead.email}`);
      const [lead] = await db.insert(leads).values(insertLead).returning();
      // Track the hash
      await db.insert(dedupeHashes).values({
        hash: insertLead.dedupeHash,
        leadId: lead.id,
      }).onConflictDoNothing();
      return lead;
    } catch (error: any) {
      console.error(`[Storage] Create lead error:`, error);
      // Handle unique constraint violation
      if (error.code === '23505') {
        return null;
      }
      throw error;
    }
  }

  async createLeads(leadsData: InsertLead[]): Promise<Lead[]> {
    const results: Lead[] = [];
    for (const lead of leadsData) {
      const created = await this.createLead(lead);
      if (created) {
        results.push(created);
      }
    }
    return results;
  }

  async getLeads(params?: PaginationParams): Promise<{ leads: Lead[]; total: number; page: number; totalPages: number }> {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;
    
    let query = db.select().from(leads);
    let countQuery = db.select({ count: count() }).from(leads);
    
    if (params?.qualified === 'qualified') {
      query = query.where(eq(leads.isQualified, true)) as typeof query;
      countQuery = countQuery.where(eq(leads.isQualified, true)) as typeof countQuery;
    } else if (params?.qualified === 'unqualified') {
      query = query.where(eq(leads.isQualified, false)) as typeof query;
      countQuery = countQuery.where(eq(leads.isQualified, false)) as typeof countQuery;
    }
    
    const [totalResult] = await countQuery;
    const total = totalResult?.count || 0;
    
    const leadsList = await query
      .orderBy(desc(leads.relevanceScore), desc(leads.scrapedAt))
      .limit(limit)
      .offset(offset);
    
    return {
      leads: leadsList,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async getLeadsByJob(jobId: number): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.jobId, jobId)).orderBy(desc(leads.relevanceScore));
  }

  async getStats(): Promise<{ total: number; qualified: number; averageScore: number }> {
    const allLeads = await db.select().from(leads);
    const qualified = allLeads.filter((l) => l.isQualified).length;
    const totalScore = allLeads.reduce((sum, l) => sum + (l.relevanceScore || 0), 0);
    const averageScore = allLeads.length > 0 ? Math.round(totalScore / allLeads.length) : 0;
    return { total: allLeads.length, qualified, averageScore };
  }

  async clearLeads(): Promise<void> {
    await db.delete(dedupeHashes);
    await db.delete(leads);
  }

  async checkDuplicate(hash: string): Promise<boolean> {
    const [existing] = await db.select().from(dedupeHashes).where(eq(dedupeHashes.hash, hash));
    return !!existing;
  }

  async createScrapeJob(job: InsertScrapeJob): Promise<ScrapeJob> {
    const [created] = await db.insert(scrapeJobs).values({
      ...job,
      status: 'queued',
      processedCount: 0,
      qualifiedCount: 0,
      duplicatesSkipped: 0,
      activeWorkers: 0,
      totalWorkers: 20,
    }).returning();
    return created;
  }

  async getScrapeJob(id: number): Promise<ScrapeJob | undefined> {
    const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
    return job;
  }

  async getScrapeJobs(): Promise<ScrapeJob[]> {
    return await db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.createdAt));
  }

  async updateScrapeJobStatus(id: number, status: string, errorMessage?: string): Promise<ScrapeJob | undefined> {
    const [updated] = await db.update(scrapeJobs)
      .set({ status, errorMessage })
      .where(eq(scrapeJobs.id, id))
      .returning();
    return updated;
  }

  async updateScrapeJobProgress(id: number, updates: Partial<Pick<ScrapeJob, 'processedCount' | 'qualifiedCount' | 'duplicatesSkipped' | 'activeWorkers'>>): Promise<void> {
    await db.update(scrapeJobs)
      .set(updates)
      .where(eq(scrapeJobs.id, id));
  }

  async startScrapeJob(id: number): Promise<void> {
    await db.update(scrapeJobs)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(scrapeJobs.id, id));
  }

  async completeScrapeJob(id: number): Promise<void> {
    await db.update(scrapeJobs)
      .set({ status: 'completed', completedAt: new Date(), activeWorkers: 0 })
      .where(eq(scrapeJobs.id, id));
  }

  async addJobLog(log: InsertJobLog): Promise<JobLog> {
    const [created] = await db.insert(jobLogs).values(log).returning();
    return created;
  }

  async getJobLogs(jobId: number, limit: number = 100): Promise<JobLog[]> {
    return await db.select()
      .from(jobLogs)
      .where(eq(jobLogs.jobId, jobId))
      .orderBy(desc(jobLogs.createdAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
