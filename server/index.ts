import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { migrate } from "./db";
import { authRouter, loadUser } from "./auth";
import { adminRouter } from "./admin";
import { sameOrigin } from "./util";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", sameOrigin, loadUser);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Static client (production build)
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = [path.resolve(here, "../public"), path.resolve(process.cwd(), "dist/public")].find((d) => fs.existsSync(d));
if (clientDir) {
  app.use(express.static(clientDir, {
    index: false,
    setHeaders: (res, p) => {
      if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "no-cache");
    },
  }));
  app.get(/^(?!\/api).*/, (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(clientDir, "index.html")); });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid request" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const port = Number(process.env.PORT ?? 3000);
migrate()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`Poker at Thiv's listening on :${port}`)))
  .catch((e) => { console.error("Database migration failed:", e.message); process.exit(1); });
