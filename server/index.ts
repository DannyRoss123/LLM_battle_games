import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { connect4Router } from "./connect4Routes.ts";
import { hasApiKey, MODEL } from "./llm/claudeConnect4.ts";

const PORT = Number(process.env.PORT) || 8787;
const isProd = process.argv.includes("--prod");

const app = express();
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: hasApiKey(), model: MODEL });
});
app.use("/api/connect4", connect4Router);

// In production, serve the built React app from the same server.
if (isProd) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] model: ${MODEL} | API key ${hasApiKey() ? "found" : "MISSING (local fallback bot will play)"}`);
});
