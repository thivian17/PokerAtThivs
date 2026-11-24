import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (e: string) => EMAIL_RE.test(e) && e.length <= 254;

export const adminEmails = () =>
  new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean));
export const isAdminEmail = (e: string) => adminEmails().has(normalizeEmail(e));

const pepper = () => process.env.SESSION_PEPPER ?? "dev-pepper-change-me";
export const hash = (v: string) => crypto.createHash("sha256").update(v + pepper()).digest("hex");

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Small in-memory fixed-window limiter (per instance)
const buckets = new Map<string, { n: number; reset: number }>();
export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return { ok: true, retryAfter: 0 }; }
  b.n++;
  return { ok: b.n <= limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref();

/** Basic CSRF defence for cookie-authenticated routes: Origin (if sent) must match Host. */
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "Bad origin" });
    } catch { return res.status(403).json({ error: "Bad origin" }); }
  }
  next();
}

export const asyncH = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
