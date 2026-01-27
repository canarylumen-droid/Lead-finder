import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ScrapeRequest } from "@shared/routes";

// GET /api/leads
export function useLeads() {
  return useQuery({
    queryKey: [api.leads.list.path],
    queryFn: async () => {
      const res = await fetch(api.leads.list.path);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return api.leads.list.responses[200].parse(await res.json());
    },
  });
}

// POST /api/scrape
export function useScrapeLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ScrapeRequest) => {
      // Validate input before sending using Zod schema from routes
      const validated = api.leads.scrape.input.parse(data);
      
      const res = await fetch(api.leads.scrape.path, {
        method: api.leads.scrape.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });
      
      if (!res.ok) throw new Error("Failed to start scraping job");
      return api.leads.scrape.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leads.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.leads.stats.path] });
    },
  });
}

// GET /api/stats
export function useStats() {
  return useQuery({
    queryKey: [api.leads.stats.path],
    queryFn: async () => {
      const res = await fetch(api.leads.stats.path);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return api.leads.stats.responses[200].parse(await res.json());
    },
  });
}

// Export URL helper
export const getExportUrl = () => api.leads.export.path;

// GET /api/proxy-status
export function useProxyStatus() {
  return useQuery({
    queryKey: ['/api/proxy-status'],
    queryFn: async () => {
      const res = await fetch('/api/proxy-status');
      if (!res.ok) throw new Error("Failed to fetch proxy status");
      return res.json() as Promise<{ configured: boolean; host: string | null; port: number | null }>;
    },
  });
}
