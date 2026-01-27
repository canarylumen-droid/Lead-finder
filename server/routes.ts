import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { 
  scrapeInstagramSearch, 
  scrapeLinkedInSearch, 
  getProxyConfigFromEnv,
  qualifyLead,
  type ScrapedProfile 
} from "./scraper";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Get all leads
  app.get(api.leads.list.path, async (req, res) => {
    const leads = await storage.getLeads();
    res.json(leads);
  });

  // Get stats
  app.get(api.leads.stats.path, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Get scrape jobs
  app.get('/api/jobs', async (req, res) => {
    const jobs = await storage.getScrapeJobs();
    res.json(jobs);
  });

  // Get single job status
  app.get('/api/jobs/:id', async (req, res) => {
    const job = await storage.getScrapeJob(Number(req.params.id));
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json(job);
  });

  // Check proxy configuration status
  app.get('/api/proxy-status', async (req, res) => {
    const proxyConfig = getProxyConfigFromEnv();
    res.json({
      configured: !!proxyConfig,
      host: proxyConfig?.host ? `${proxyConfig.host.substring(0, 10)}...` : null,
      port: proxyConfig?.port || null,
    });
  });

  // Start scraping job
  app.post(api.leads.scrape.path, async (req, res) => {
    try {
      const { platform, query, quantity, offering } = api.leads.scrape.input.parse(req.body);
      
      // Check proxy configuration
      const proxyConfig = getProxyConfigFromEnv();
      
      if (!proxyConfig) {
        return res.status(400).json({
          message: 'Proxy not configured. Real scraping requires rotating proxies.',
          error: 'PROXY_REQUIRED',
          instructions: 'Set environment variables: PROXY_HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD',
          leads: [],
        });
      }

      // Create scrape job
      const job = await storage.createScrapeJob({
        platform,
        query,
        offering,
        quantity,
      });

      // Update job status to processing
      await storage.updateScrapeJobStatus(job.id, 'processing');

      let scrapedProfiles: ScrapedProfile[] = [];
      
      try {
        if (platform === 'instagram' || platform === 'both') {
          const instagramProfiles = await scrapeInstagramSearch(query, proxyConfig);
          scrapedProfiles.push(...instagramProfiles);
        }
        
        if (platform === 'linkedin' || platform === 'both') {
          const linkedinProfiles = await scrapeLinkedInSearch(query, proxyConfig);
          scrapedProfiles.push(...linkedinProfiles);
        }

        // Limit to requested quantity
        scrapedProfiles = scrapedProfiles.slice(0, quantity);

        // Qualify and save leads
        const leadsToSave = scrapedProfiles.map(profile => {
          const { isQualified, score } = qualifyLead(profile, offering);
          return {
            platform: profile.platform,
            username: profile.username,
            profileUrl: profile.profileUrl,
            followerCount: profile.followerCount,
            bio: profile.bio,
            email: profile.email,
            name: profile.name,
            title: profile.title,
            company: profile.company,
            companySize: profile.companySize,
            isQualified,
            relevanceScore: score,
            queryUsed: query,
            metadata: {},
          };
        });

        const savedLeads = await storage.createLeads(leadsToSave);
        await storage.completeScrapeJob(job.id);

        res.json({
          message: `Successfully scraped ${savedLeads.length} leads`,
          jobId: job.id.toString(),
          leads: savedLeads,
        });

      } catch (scrapeError: any) {
        await storage.updateScrapeJobStatus(job.id, 'failed', scrapeError.message);
        
        // Return specific error for proxy issues
        if (scrapeError.message.includes('PROXY')) {
          return res.status(400).json({
            message: scrapeError.message,
            error: 'SCRAPE_FAILED',
            jobId: job.id.toString(),
            leads: [],
          });
        }
        
        throw scrapeError;
      }

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          leads: [],
        });
      }
      console.error('Scrape error:', err);
      res.status(500).json({ message: 'Failed to scrape leads', leads: [] });
    }
  });

  // Export leads as CSV
  app.get(api.leads.export.path, async (req, res) => {
    const leads = await storage.getLeads();
    const csvHeader = "ID,Platform,Username,Name,Title,Company,Profile URL,Followers,Bio,Email,Qualified,Score,Query,Scraped At\n";
    const csvRows = leads.map(l => 
      `${l.id},${l.platform},"${l.username}","${l.name || ''}","${l.title || ''}","${l.company || ''}",${l.profileUrl},${l.followerCount},"${(l.bio || '').replace(/"/g, '""')}",${l.email || ''},${l.isQualified},${l.relevanceScore},"${l.queryUsed}",${l.scrapedAt}`
    ).join("\n");
    
    res.header('Content-Type', 'text/csv');
    res.attachment('leads.csv');
    res.send(csvHeader + csvRows);
  });

  // Clear all leads (for testing)
  app.delete('/api/leads', async (req, res) => {
    await storage.clearLeads();
    res.json({ message: 'All leads cleared' });
  });

  return httpServer;
}
