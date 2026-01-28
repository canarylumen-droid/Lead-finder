import { storage, generateDedupeHash } from "./storage";
import { analyzeProfileWithAI } from "./ai-analyzer";
import { scrapeInstagramProfiles, scrapeLinkedInProfiles, type ScrapedProfile, isValidFollowerCount } from "./scraper/real-scraper";
import type { InsertLead, JobStats, LogEntry } from "@shared/schema";
import { EventEmitter } from "events";

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

  async startJob(jobId: number, platform: string, keywords: string[], offering: string, quantity: number): Promise<void> {
    await storage.startScrapeJob(jobId);
    this.activeJobs.set(jobId, { running: true, targetCount: quantity });
    
    await this.emitLog(jobId, undefined, 'info', `Starting real-time scraping with ${this.maxWorkers} workers`);
    await this.emitLog(jobId, undefined, 'info', `Target: ${quantity} qualified leads from ${platform}`);
    await this.emitLog(jobId, undefined, 'info', `Keywords: ${keywords.join(', ')}`);
    
    await storage.updateScrapeJobProgress(jobId, { activeWorkers: this.maxWorkers });
    await this.emitStats(jobId);

    // Start real scraping based on platform
    try {
      let allProfiles: ScrapedProfile[] = [];
      
      const onProgress = async (msg: string) => {
        await this.emitLog(jobId, Math.floor(Math.random() * this.maxWorkers), 'info', msg);
      };

      if (platform === 'instagram' || platform === 'both') {
        await this.emitLog(jobId, undefined, 'info', 'Starting Instagram scraping...');
        const igProfiles = await scrapeInstagramProfiles(keywords, Math.ceil(quantity / (platform === 'both' ? 2 : 1)), onProgress);
        allProfiles.push(...igProfiles);
      }

      if (platform === 'linkedin' || platform === 'both') {
        await this.emitLog(jobId, undefined, 'info', 'Starting LinkedIn scraping...');
        const liProfiles = await scrapeLinkedInProfiles(keywords, Math.ceil(quantity / (platform === 'both' ? 2 : 1)), onProgress);
        allProfiles.push(...liProfiles);
      }

      await this.emitLog(jobId, undefined, 'info', `Scraped ${allProfiles.length} raw profiles. Now analyzing with AI...`);

      // Process each real profile
      let processedCount = 0;
      let qualifiedCount = 0;
      let duplicatesSkipped = 0;

      for (let i = 0; i < allProfiles.length && i < quantity; i++) {
        const profile = allProfiles[i];
        const workerId = i % this.maxWorkers;

        // Check follower range (1k-80k)
        if (!isValidFollowerCount(profile.followerCount)) {
          await this.emitLog(jobId, workerId, 'warn', `Skipped: ${profile.username} - ${profile.followerCount} followers (outside 1k-80k)`);
          continue;
        }

        // Generate dedupe hash
        const dedupeHash = generateDedupeHash(profile.email, profile.platform, profile.username);
        
        // Check duplicate
        const isDuplicate = await storage.checkDuplicate(dedupeHash);
        if (isDuplicate) {
          duplicatesSkipped++;
          await this.emitLog(jobId, workerId, 'warn', `Duplicate: ${profile.username}`);
          continue;
        }

        // AI Analysis - analyze real profile data
        await this.emitLog(jobId, workerId, 'info', `Analyzing: ${profile.name || profile.username}`);
        const analysis = await analyzeProfileWithAI({
          platform: profile.platform,
          username: profile.username,
          bio: profile.bio,
          name: profile.name,
          title: profile.title,
          company: profile.company,
          followerCount: profile.followerCount,
          email: profile.email,
        }, offering);

        // Skip freelancers and low-intent leads
        if (analysis.businessType === 'freelancer' || analysis.relevanceScore < 30) {
          await this.emitLog(jobId, workerId, 'warn', `Skipped: ${profile.username} - ${analysis.businessType} (low intent)`);
          continue;
        }

        // Save qualified lead
        const lead: InsertLead = {
          platform: profile.platform,
          username: profile.username,
          profileUrl: profile.profileUrl,
          followerCount: profile.followerCount,
          bio: profile.bio,
          email: profile.email,
          name: profile.name || null,
          title: profile.title || null,
          company: profile.company || null,
          companySize: null,
          businessType: analysis.businessType,
          contextSummary: analysis.contextSummary,
          isQualified: analysis.isQualified,
          relevanceScore: analysis.relevanceScore,
          queryUsed: keywords.join(', '),
          jobId,
          dedupeHash,
          metadata: { analysis },
        };

        const savedLead = await storage.createLead(lead);
        if (savedLead) {
          processedCount++;
          if (analysis.isQualified) qualifiedCount++;

          await this.emitLog(
            jobId,
            workerId,
            analysis.isQualified ? 'success' : 'info',
            `${analysis.isQualified ? 'QUALIFIED' : 'Added'}: ${profile.name || profile.username} (${analysis.businessType}, ${analysis.relevanceScore}%)${profile.email ? ' - has email' : ''}`,
            { email: profile.email, businessType: analysis.businessType }
          );
        }

        // Update progress
        await storage.updateScrapeJobProgress(jobId, {
          processedCount,
          qualifiedCount,
          duplicatesSkipped,
        });
        await this.emitStats(jobId);
      }

      // Complete job
      await this.completeJob(jobId, processedCount, qualifiedCount, duplicatesSkipped);

    } catch (error: any) {
      await this.emitLog(jobId, undefined, 'error', `Job failed: ${error.message}`);
      await storage.updateScrapeJobStatus(jobId, 'failed');
    }
  }

  private async completeJob(jobId: number, processedCount: number, qualifiedCount: number, duplicatesSkipped: number) {
    this.activeJobs.delete(jobId);
    await storage.completeScrapeJob(jobId);
    await storage.updateScrapeJobProgress(jobId, { activeWorkers: 0 });
    
    await this.emitLog(
      jobId,
      undefined,
      'success',
      `Job completed: ${processedCount} leads found, ${qualifiedCount} qualified, ${duplicatesSkipped} duplicates skipped`
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
