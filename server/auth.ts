import crypto from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { q } from "./db";
import { normalizeEmail, isValidEmail, isAdminEmail, hash, hit, safeEqual, asyncH } from "./util";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

export interface AuthedUser { id: number; email: string; display_name: string | null; admin_unlocked: boolean }
declare global { namespace Express { interface Request { user?: AuthedUser; sessionHash?: string } } }

export async function isAllowed(email: string) {
  if (isAdminEmail(email)) return true;
  const r = await q("SELECT 1 FROM allowlist WHERE email = $1", [email]);
  return r.rowCount! > 0;
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const th = hash(token);
    const r = await q<AuthedUser>(
      `SELECT u.id, u.email, u.display_name, s.admin_unlocked FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`, [th]);
    // Removing someone from the allowlist revokes their access immediately
    if (r.rows[0] && (await isAllowed(r.rows[0].email))) { req.user = r.rows[0]; req.sessionHash = th; }
  } catch (e) { return next(e); }
  next();
}

const meBody = (u: AuthedUser) => ({
  user: { id: u.id, email: u.email, display_name: u.display_name },
  isAdmin: isAdminEmail(u.email),
  adminUnlocked: isAdminEmail(u.email) && u.admin_unlocked,
});

export const requireAuth = (req: Request, res: Response, next: NextFunction) =>
  req.user ? next() : res.status(401).json({ error: "Not signed in" });
export const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
  !req.user ? res.status(401).json({ error: "Not signed in" })
  : isAdminEmail(req.user.email) && req.user.admin_unlocked ? next()
  : res.status(403).json({ error: "Admins only" });

export const authRouter = Router();

// Email-only sign-in: if the email is on the allowlist (filled out the form), you're in.
authRouter.post("/login", asyncH(async (req, res) => {
  const email = normalizeEmail(z.object({ email: z.string().max(254) }).parse(req.body).email);
  if (!isValidEmail(email)) return res.status(400).json({ status: "invalid_email" });

  const ipHit = hit(`login:${req.ip}`, 30, 10 * 60_000);
  if (!ipHit.ok) return res.status(429).json({ status: "rate_limited", retryAfterSeconds: ipHit.retryAfter });

  if (!(await isAllowed(email))) {
    return res.json({ status: "not_registered", formUrl: process.env.FORM_URL ?? null });
  }

  const al = await q<{ name: string | null }>(`SELECT name FROM allowlist WHERE email = $1`, [email]);
  const displayName = al.rows[0]?.name || email.split("@")[0];
  const u = await q<{ id: number; email: string; display_name: string | null }>(
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
  res.json({ status: "ok", ...meBody({ ...u.rows[0], admin_unlocked: false }) });
}));

// Admin pages need a password on top of the email, since emails alone are guessable.
authRouter.post("/admin-unlock", asyncH(async (req, res) => {
  if (!req.user || !isAdminEmail(req.user.email)) return res.status(403).json({ status: "forbidden" });
  const ipHit = hit(`unlock:${req.ip}`, 10, 15 * 60_000);
  if (!ipHit.ok) return res.status(429).json({ status: "rate_limited", retryAfterSeconds: ipHit.retryAfter });
  const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !safeEqual(hash(password), hash(expected))) return res.status(401).json({ status: "wrong_password" });
  await q(`UPDATE sessions SET admin_unlocked = true WHERE token_hash = $1`, [req.sessionHash]);
  res.json({ status: "ok" });
}));

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  res.json(meBody(req.user));
});

authRouter.post("/logout", asyncH(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await q(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
}));
