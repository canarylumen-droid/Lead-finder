import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, generateDedupeHash } from "./storage";
import { api } from "@shared/routes";
import { paginationSchema } from "@shared/schema";
import { z } from "zod";
import { workerPool } from "./worker-pool";
import { analyzeOffering } from "./offering-analyzer";
import type { JobStats, LogEntry } from "@shared/schema";

// Store WebSocket clients per job
const jobClients: Map<number, Set<WebSocket>> = new Map();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Setup WebSocket server for real-time logs
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    let subscribedJobId: number | null = null;
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'subscribe' && data.jobId) {
          subscribedJobId = Number(data.jobId);
          if (!jobClients.has(subscribedJobId)) {
            jobClients.set(subscribedJobId, new Set());
          }
          jobClients.get(subscribedJobId)?.add(ws);
        }
      } catch (e) {
        // Ignore invalid messages
      }
    });
    
    ws.on('close', () => {
      if (subscribedJobId !== null) {
        jobClients.get(subscribedJobId)?.delete(ws);
      }
    });
  });

  // Forward worker pool events to WebSocket clients
  workerPool.on('log', (log: LogEntry) => {
    const clients = jobClients.get(log.jobId);
    if (clients) {
      const message = JSON.stringify({ type: 'log', data: log });
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  });

  workerPool.on('stats', (stats: JobStats) => {
    const clients = jobClients.get(stats.jobId);
    if (clients) {
      const message = JSON.stringify({ type: 'stats', data: stats });
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  });

  workerPool.on('complete', (jobId: number) => {
    const clients = jobClients.get(jobId);
    if (clients) {
      const message = JSON.stringify({ type: 'complete', data: { jobId } });
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  });

  // Get all leads with pagination
  app.get(api.leads.list.path, async (req, res) => {
    try {
      const params = paginationSchema.parse(req.query);
      const result = await storage.getLeads(params);
      res.json(result);
    } catch (error) {
      const result = await storage.getLeads();
      res.json(result);
    }
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

  // Get job logs
  app.get('/api/jobs/:id/logs', async (req, res) => {
    const jobId = Number(req.params.id);
    const limit = Number(req.query.limit) || 100;
    const logs = await storage.getJobLogs(jobId, limit);
    res.json(logs);
  });

  // Analyze offering and suggest lead types
  app.post('/api/analyze-offering', async (req, res) => {
    try {
      const { offering } = req.body;
      if (!offering || typeof offering !== 'string') {
        return res.status(400).json({ error: 'Offering description is required' });
      }
      
      const analysis = await analyzeOffering(offering);
      res.json(analysis);
    } catch (error: any) {
      console.error('Offering analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze offering' });
    }
  });

  // Start scraping job with real keywords
  app.post(api.leads.scrape.path, async (req, res) => {
    try {
      const { platform, query, quantity, offering, keywords } = req.body;
      
      // Parse keywords from query or use provided keywords array
      let searchKeywords: string[] = [];
      if (keywords && Array.isArray(keywords)) {
        searchKeywords = keywords;
      } else if (query) {
        // Split query into keywords
        searchKeywords = query.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
      }
      
      if (searchKeywords.length === 0) {
        return res.status(400).json({ 
          message: 'Please provide search keywords', 
          leads: [] 
        });
      }
      
      // Create scrape job
      const job = await storage.createScrapeJob({
        platform: platform || 'both',
        query: searchKeywords.join(', '),
        offering: offering || '',
        quantity: quantity || 50,
        totalWorkers: 20,
      });

      // Start the job with real scraping (async)
      workerPool.startJob(job.id, platform || 'both', searchKeywords, offering || '', quantity || 50);

      res.json({
        message: `Job started. Scraping real profiles with keywords: ${searchKeywords.join(', ')}`,
        jobId: job.id.toString(),
        leads: [],
      });

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          leads: [],
        });
      }
      console.error('Scrape error:', err);
      res.status(500).json({ message: 'Failed to start scraping job', leads: [] });
    }
  });

  // Cancel a job
  app.post('/api/jobs/:id/cancel', async (req, res) => {
    const jobId = Number(req.params.id);
    workerPool.cancelJob(jobId);
    await storage.updateScrapeJobStatus(jobId, 'cancelled');
    res.json({ message: 'Job cancelled' });
  });

  // Export leads as CSV
  app.get(api.leads.export.path, async (req, res) => {
    const result = await storage.getLeads({ page: 1, limit: 10000, qualified: 'all' });
    const csvHeader = "ID,Platform,Username,Name,Title,Company,Business Type,Profile URL,Followers,Bio,Email,Qualified,Score,Context Summary,Job ID,Scraped At\n";
    const csvRows = result.leads.map(l => 
      `${l.id},${l.platform},"${l.username}","${l.name || ''}","${l.title || ''}","${l.company || ''}","${l.businessType || ''}",${l.profileUrl},${l.followerCount},"${(l.bio || '').replace(/"/g, '""')}",${l.email || ''},${l.isQualified},${l.relevanceScore},"${(l.contextSummary || '').replace(/"/g, '""')}",${l.jobId || ''},${l.scrapedAt}`
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
