import { Router } from "express";
import { z } from "zod";
import { q } from "./db";
import { requireAuth } from "./auth";
import { asyncH, hit } from "./util";

// "Guess the odds" practice scores. Honor system: the client computes the score; the server bounds it.
export const practiceRouter = Router();
practiceRouter.use(requireAuth);

/** "Jordan Lee" → "Jordan L."; email-prefix names ("jordan.lee") → "Jordan L." */
export function shortName(name: string | null, email: string) {
  const base = (name && name.trim()) || email.split("@")[0].replace(/[._-]+/g, " ");
  const parts = base.trim().split(/\s+/).filter(Boolean);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (parts.length === 0) return "Player";
  return parts.length === 1 ? cap(parts[0]) : `${cap(parts[0])} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

practiceRouter.post("/score", asyncH(async (req, res) => {
  const body = z.object({
    score: z.number().int().min(0).max(1000),
    hands: z.literal(10),
    bullseyes: z.number().int().min(0).max(10),
    avgError: z.number().min(0).max(100),
  }).parse(req.body);
  const lim = hit(`practice:${req.user!.id}`, 1, 15_000);
  if (!lim.ok) return res.status(429).json({ error: "Slow down", retryAfterSeconds: lim.retryAfter });
  await q(`INSERT INTO practice_scores (user_id, score, hands, bullseyes, avg_error) VALUES ($1, $2, $3, $4, $5)`,
    [req.user!.id, body.score, body.hands, body.bullseyes, body.avgError]);
  res.json({ ok: true, ...(await board(req.user!.id)) });
}));

practiceRouter.get("/leaderboard", asyncH(async (req, res) => {
  res.json(await board(req.user!.id));
}));

async function board(userId: number) {
  const rows = await q<{ id: number; email: string; display_name: string | null; best: number; plays: string }>(
    `SELECT u.id, u.email, u.display_name, MAX(p.score) AS best, COUNT(*) AS plays
     FROM practice_scores p JOIN users u ON u.id = p.user_id
     GROUP BY u.id ORDER BY best DESC, MIN(p.created_at) ASC`);
  const all = rows.rows.map((r, i) => ({
    rank: i + 1, name: shortName(r.display_name, r.email), best: r.best, plays: Number(r.plays), me: r.id === userId,
  }));
  return { top: all.slice(0, 10), me: all.find((r) => r.me) ?? null, players: all.length };
}
