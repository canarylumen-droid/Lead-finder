import { db } from "./db";
import { leads, scrapeJobs, type InsertLead, type Lead, type InsertScrapeJob, type ScrapeJob } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Leads
  createLead(lead: InsertLead): Promise<Lead>;
  createLeads(leadsData: InsertLead[]): Promise<Lead[]>;
  getLeads(): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  getLeadsByJob(query: string): Promise<Lead[]>;
  getStats(): Promise<{ total: number; qualified: number; averageScore: number }>;
  clearLeads(): Promise<void>;
  
  // Scrape Jobs
  createScrapeJob(job: InsertScrapeJob): Promise<ScrapeJob>;
  getScrapeJob(id: number): Promise<ScrapeJob | undefined>;
  getScrapeJobs(): Promise<ScrapeJob[]>;
  updateScrapeJobStatus(id: number, status: string, errorMessage?: string): Promise<ScrapeJob | undefined>;
  updateScrapeJobProgress(id: number, processedCount: number): Promise<void>;
  completeScrapeJob(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(insertLead).returning();
    return lead;
  }

  async createLeads(leadsData: InsertLead[]): Promise<Lead[]> {
    if (leadsData.length === 0) return [];
    const result = await db.insert(leads).values(leadsData).returning();
    return result;
  }

  async getLeads(): Promise<Lead[]> {
    return await db.select().from(leads).orderBy(desc(leads.scrapedAt));
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async getLeadsByJob(query: string): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.queryUsed, query)).orderBy(desc(leads.relevanceScore));
  }

  async getStats(): Promise<{ total: number; qualified: number; averageScore: number }> {
    const allLeads = await db.select().from(leads);
    const qualified = allLeads.filter((l) => l.isQualified).length;
    const totalScore = allLeads.reduce((sum, l) => sum + (l.relevanceScore || 0), 0);
    const averageScore = allLeads.length > 0 ? Math.round(totalScore / allLeads.length) : 0;
    return { total: allLeads.length, qualified, averageScore };
  }

  async clearLeads(): Promise<void> {
    await db.delete(leads);
  }

  async createScrapeJob(job: InsertScrapeJob): Promise<ScrapeJob> {
    const [created] = await db.insert(scrapeJobs).values({
      ...job,
      status: 'pending',
      processedCount: 0,
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

  async updateScrapeJobProgress(id: number, processedCount: number): Promise<void> {
    await db.update(scrapeJobs)
      .set({ processedCount })
      .where(eq(scrapeJobs.id, id));
  }

  async completeScrapeJob(id: number): Promise<void> {
    await db.update(scrapeJobs)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(scrapeJobs.id, id));
  }
}

export const storage = new DatabaseStorage();
