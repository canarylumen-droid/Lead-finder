import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { router } from "./routes.js";
import { smtpRouter } from "./smtp-routes.js";
import { mailcowRouter } from "./mailcow-routes.js";
import { dnsRouter } from "./dns-routes.js";
import { analyticsRouter } from "./analytics-routes.js";
import { setupWebSocketServer } from "./websocket.js";
import { startRelayServer } from "./smtp-relay/index.js";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const t = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${t} [${source}] ${message}`);
}

app.use((req, _res, next) => {
  const start = Date.now();
  _res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${_res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

app.use(router);
app.use(smtpRouter);
app.use(mailcowRouter);
app.use(dnsRouter);
app.use(analyticsRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; message?: string };
  const status = e.status || 500;
  res.status(status).json({ message: e.message || "Internal Server Error" });
});

(async () => {
  setupWebSocketServer(httpServer);

  // Start SMTP relay multiplexer on port 2525
  try {
    startRelayServer();
  } catch (err: unknown) {
    console.error("[relay] Failed to start:", (err as Error).message);
  }

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./static.js");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });
})();
