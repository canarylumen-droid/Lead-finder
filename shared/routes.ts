import { z } from 'zod';
import { leads, scrapeJobs, scrapeRequestSchema } from './schema';

export const api = {
  leads: {
    list: {
      method: 'GET' as const,
      path: '/api/leads',
      responses: {
        200: z.array(z.custom<typeof leads.$inferSelect>()),
      },
    },
    scrape: {
      method: 'POST' as const,
      path: '/api/scrape',
      input: scrapeRequestSchema,
      responses: {
        200: z.object({
          message: z.string(),
          jobId: z.string().optional(),
          leads: z.array(z.custom<typeof leads.$inferSelect>()),
          error: z.string().optional(),
          instructions: z.string().optional(),
        }),
        400: z.object({
          message: z.string(),
          error: z.string().optional(),
          instructions: z.string().optional(),
          leads: z.array(z.any()),
        }),
      },
    },
    export: {
      method: 'GET' as const,
      path: '/api/leads/export',
      responses: {
        200: z.any(),
      },
    },
    stats: {
      method: 'GET' as const,
      path: '/api/stats',
      responses: {
        200: z.object({
          total: z.number(),
          qualified: z.number(),
          averageScore: z.number(),
        }),
      },
    },
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs',
      responses: {
        200: z.array(z.custom<typeof scrapeJobs.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/jobs/:id',
      responses: {
        200: z.custom<typeof scrapeJobs.$inferSelect>(),
        404: z.object({ message: z.string() }),
      },
    },
  },
  proxy: {
    status: {
      method: 'GET' as const,
      path: '/api/proxy-status',
      responses: {
        200: z.object({
          configured: z.boolean(),
          host: z.string().nullable(),
          port: z.number().nullable(),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
