import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "http";
import { scraperEvents, type SessionUpdateEvent } from "./events.js";
import { log } from "./index.js";

// Map: sessionId → Set of connected WS clients subscribed to it
const subscriptions = new Map<number, Set<WebSocket>>();

function broadcast(sessionId: number, payload: object) {
  const clients = subscriptions.get(sessionId);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

export function setupWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let subscribedSessions = new Set<number>();

    ws.on("message", (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "subscribe" && typeof msg.sessionId === "number") {
          const sid = msg.sessionId;
          if (!subscriptions.has(sid)) subscriptions.set(sid, new Set());
          subscriptions.get(sid)!.add(ws);
          subscribedSessions.add(sid);
          ws.send(JSON.stringify({ type: "subscribed", sessionId: sid }));
        }

        if (msg.type === "unsubscribe" && typeof msg.sessionId === "number") {
          subscriptions.get(msg.sessionId)?.delete(ws);
          subscribedSessions.delete(msg.sessionId);
        }
      } catch (_) {}
    });

    ws.on("close", () => {
      subscribedSessions.forEach((sid) => {
        subscriptions.get(sid)?.delete(ws);
        if (subscriptions.get(sid)?.size === 0) subscriptions.delete(sid);
      });
      subscribedSessions.clear();
    });

    ws.on("error", () => ws.terminate());
  });

  // Listen to scraper events and push to subscribed clients
  scraperEvents.on("session_update", (evt: SessionUpdateEvent) => {
    broadcast(evt.sessionId, { type: "session_update", ...evt });
  });

  log("WebSocket server ready at /ws");
  return wss;
}
