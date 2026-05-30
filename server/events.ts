import { EventEmitter } from "events";

export interface SessionUpdateEvent {
  sessionId: number;
  leadsCount: number;
  emailCount: number;
  status: "running" | "completed" | "failed";
  leadsPerMinute?: number;
  etaMinutes?: number;
}

class ScraperEventBus extends EventEmitter {}
export const scraperEvents = new ScraperEventBus();
scraperEvents.setMaxListeners(500);
