import express from "express";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.use(express.json());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "LeadGen server running" });
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen({ port, host: "0.0.0.0" }, () => {
  log(`serving on port ${port}`);
});
