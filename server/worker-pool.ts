import { storage, generateDedupeHash } from "./storage";
import { analyzeProfileWithAI } from "./ai-analyzer";
import { scrapeInstagramProfiles, scrapeLinkedInProfiles, type ScrapedProfile, isValidFollowerCount } from "./scraper/real-scraper";
import type { InsertLead, JobStats, LogEntry } from "@shared/schema";
import { EventEmitter } from "events";
import pLimit from "p-limit";

class WorkerPool extends EventEmitter {
  private workers: Map<number, boolean> = new Map();
  private activeJobs: Map<number, { running: boolean; targetCount: number }> = new Map();
  private maxWorkers: number = 20;

  constructor(workerCount: number = 20) {
    super();
    this.maxWorkers = workerCount;
    for (let i = 0; i < workerCount; i++) {
      this.workers.set(i, false);
    }
  }

  private async emitLog(jobId: number, workerId: number | undefined, level: string, message: string, data?: any) {
    const log = await storage.addJobLog({
      jobId,
      workerId: workerId ?? null,
      level,
      message,
      data: data ?? null,
    });
    
    const logEntry: LogEntry = {
      id: log.id,
      jobId: log.jobId,
      workerId: log.workerId ?? undefined,
      level: log.level,
      message: log.message,
      data: log.data,
      timestamp: log.createdAt?.toISOString() || new Date().toISOString(),
    };
    
    this.emit('log', logEntry);
  }

  private async emitStats(jobId: number) {
    const job = await storage.getScrapeJob(jobId);
    if (job) {
      const stats: JobStats = {
        jobId: job.id,
        status: job.status,
        processedCount: job.processedCount || 0,
        qualifiedCount: job.qualifiedCount || 0,
        duplicatesSkipped: job.duplicatesSkipped || 0,
        activeWorkers: job.activeWorkers || 0,
        totalWorkers: job.totalWorkers || this.maxWorkers,
      };
      this.emit('stats', stats);
    }
  }

  async startJob(jobId: number, platform: string, keywords: string | string[], offering: string, quantity: number): Promise<void> {
    // Handle keywords as string or array
    const keywordList = Array.isArray(keywords) 
      ? keywords 
      : keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);

    await storage.startScrapeJob(jobId);
    this.activeJobs.set(jobId, { running: true, targetCount: quantity });
    
    // Trigger actual scraping logic from browser-automation.ts
    const { scrapeLeads } = await import("./scrapers/browser-automation");
    scrapeLeads(jobId, platform, Array.isArray(keywords) ? keywords.join(' ') : keywords, quantity).catch(err => {
      console.error("Job execution failed:", err);
      this.emitLog(jobId, undefined, 'error', `Job execution failed: ${err.message}`);
    });

    await this.emitLog(jobId, undefined, 'info', `Job initialized and processing...`);
    await this.emitStats(jobId);
  }

  private async completeJob(jobId: number, processedCount: number, qualifiedCount: number, duplicatesSkipped: number) {
    this.activeJobs.delete(jobId);
    await storage.completeScrapeJob(jobId);
    await storage.updateScrapeJobProgress(jobId, { activeWorkers: 0 });
    
    await this.emitLog(
      jobId,
      undefined,
      'success',
      `Done! ${processedCount} leads found, ${qualifiedCount} qualified, ${duplicatesSkipped} duplicates skipped`
    );
    await this.emitStats(jobId);
    this.emit('complete', jobId);
  }

  cancelJob(jobId: number) {
    const jobInfo = this.activeJobs.get(jobId);
    if (jobInfo) {
      jobInfo.running = false;
      this.activeJobs.delete(jobId);
    }
  }

  getActiveJobs(): number[] {
    return Array.from(this.activeJobs.keys());
  }
}

export const workerPool = new WorkerPool(20);
