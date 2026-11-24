import crypto from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { q } from "./db";
import { normalizeEmail, isValidEmail, isAdminEmail, hash, hit, asyncH } from "./util";
import { sendCodeEmail } from "./email";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;
const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export interface AuthedUser { id: number; email: string; display_name: string | null }
declare global { namespace Express { interface Request { user?: AuthedUser } } }

const appUrl = (req: Request) => process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

export async function isAllowed(email: string) {
  if (isAdminEmail(email)) return true;
  const r = await q("SELECT 1 FROM allowlist WHERE email = $1", [email]);
  return r.rowCount! > 0;
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const r = await q<AuthedUser>(
      `SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`, [hash(token)]);
    if (r.rows[0] && (await isAllowed(r.rows[0].email))) req.user = r.rows[0];
  } catch (e) { return next(e); }
  next();
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) =>
  req.user ? next() : res.status(401).json({ error: "Not signed in" });
export const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
  !req.user ? res.status(401).json({ error: "Not signed in" })
  : isAdminEmail(req.user.email) ? next() : res.status(403).json({ error: "Admins only" });

export const authRouter = Router();

authRouter.post("/request-code", asyncH(async (req, res) => {
  const email = normalizeEmail(z.object({ email: z.string().max(254) }).parse(req.body).email);
  if (!isValidEmail(email)) return res.status(400).json({ status: "invalid_email" });

  const ipHit = hit(`ip:${req.ip}`, 20, 10 * 60_000);
  if (!ipHit.ok) return res.status(429).json({ status: "rate_limited", retryAfterSeconds: ipHit.retryAfter });

  if (!(await isAllowed(email))) {
    return res.json({ status: "not_registered", formUrl: process.env.FORM_URL ?? null });
  }

  // Per-email limits: 1 per 60s, 5 per hour (DB-backed, works across instances)
  const recent = await q<{ last: Date | null; hour: string }>(
    `SELECT max(created_at) AS last, count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour
     FROM login_codes WHERE email = $1`, [email]);
  const last = recent.rows[0]?.last ? new Date(recent.rows[0].last).getTime() : 0;
  const sinceLast = (Date.now() - last) / 1000;
  if (sinceLast < 60) return res.status(429).json({ status: "rate_limited", retryAfterSeconds: Math.ceil(60 - sinceLast) });
  if (Number(recent.rows[0]?.hour ?? 0) >= 5) return res.status(429).json({ status: "rate_limited", retryAfterSeconds: 900 });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q(`UPDATE login_codes SET used_at = now() WHERE email = $1 AND used_at IS NULL`, [email]);
  await q(`INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '${CODE_TTL_MIN} minutes')`,
    [email, hash(`${email}:${code}`)]);
  try {
    await sendCodeEmail(email, code, appUrl(req));
  } catch (e) {
    console.error("Email send failed:", (e as Error).message);
    return res.status(502).json({ status: "email_failed" });
  }
  res.json({ status: "sent" });
}));

authRouter.post("/verify", asyncH(async (req, res) => {
  const body = z.object({ email: z.string().max(254), code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ status: "invalid" });
  const email = normalizeEmail(body.data.email);

  const ipHit = hit(`verify:${req.ip}`, 40, 10 * 60_000);
  if (!ipHit.ok) return res.status(429).json({ status: "rate_limited", retryAfterSeconds: ipHit.retryAfter });

  const r = await q<{ id: number; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM login_codes
     WHERE email = $1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`, [email]);
  const row = r.rows[0];
  if (!row) return res.status(400).json({ status: "expired" });
  if (row.attempts >= MAX_ATTEMPTS) return res.status(400).json({ status: "locked" });

  if (row.code_hash !== hash(`${email}:${body.data.code}`)) {
    const attempts = row.attempts + 1;
    await q(`UPDATE login_codes SET attempts = $2 ${attempts >= MAX_ATTEMPTS ? ", used_at = now()" : ""} WHERE id = $1`, [row.id, attempts]);
    return res.status(400).json(attempts >= MAX_ATTEMPTS ? { status: "locked" } : { status: "wrong_code", attemptsLeft: MAX_ATTEMPTS - attempts });
  }
  if (!(await isAllowed(email))) return res.status(403).json({ status: "not_registered" });

  await q(`UPDATE login_codes SET used_at = now() WHERE id = $1`, [row.id]);
  const al = await q<{ name: string | null }>(`SELECT name FROM allowlist WHERE email = $1`, [email]);
  const displayName = al.rows[0]?.name || email.split("@")[0];
  const u = await q<AuthedUser>(
    `INSERT INTO users (email, display_name, last_login_at) VALUES ($1, $2, now())
     ON CONFLICT (email) DO UPDATE SET last_login_at = now(),
       display_name = COALESCE(users.display_name, EXCLUDED.display_name)
     RETURNING id, email, display_name`, [email, displayName]);

  const token = crypto.randomBytes(32).toString("base64url");
  await q(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [hash(token), u.rows[0].id]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400_000, path: "/",
  });
  res.json({ status: "ok", user: u.rows[0], isAdmin: isAdminEmail(email) });
}));

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  res.json({ user: req.user, isAdmin: isAdminEmail(req.user.email) });
});

authRouter.post("/logout", asyncH(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await q(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
}));
