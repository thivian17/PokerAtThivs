import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { q } from "./db";
import { normalizeEmail, isValidEmail, asyncH } from "./util";
import { requireAdmin } from "./auth";

// ---------- Admin ----------
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/allowlist", asyncH(async (_req, res) => {
  const rows = await q(
    `SELECT a.email, a.name, a.source, a.submitted_at, a.created_at, u.last_login_at
     FROM allowlist a LEFT JOIN users u ON u.email = a.email ORDER BY a.created_at DESC`);
  const stats = {
    total: rows.rowCount,
    loggedIn: rows.rows.filter((r) => r.last_login_at).length,
    bySource: rows.rows.reduce((acc: Record<string, number>, r) => ((acc[r.source] = (acc[r.source] ?? 0) + 1), acc), {}),
  };
  res.json({ rows: rows.rows, stats });
}));

adminRouter.post("/allowlist", asyncH(async (req, res) => {
  const body = z.object({ email: z.string().max(254), name: z.string().max(120).optional() }).parse(req.body);
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: `"${body.email}" isn't a valid email` });
  const r = await q(`INSERT INTO allowlist (email, name, source) VALUES ($1, $2, 'manual') ON CONFLICT (email) DO NOTHING`,
    [email, body.name?.trim() || null]);
  if (r.rowCount === 0) return res.status(409).json({ error: `${email} is already on the list` });
  res.json({ ok: true, email });
}));

adminRouter.patch("/allowlist/:email", asyncH(async (req, res) => {
  const { name } = z.object({ name: z.string().max(120) }).parse(req.body);
  const email = normalizeEmail(req.params.email);
  const r = await q(`UPDATE allowlist SET name = $2 WHERE email = $1`, [email, name.trim() || null]);
  if (r.rowCount === 0) return res.status(404).json({ error: "Not on the list" });
  if (name.trim()) await q(`UPDATE users SET display_name = $2 WHERE email = $1`, [email, name.trim()]);
  res.json({ ok: true });
}));

// Removing someone also ends every session they have.
adminRouter.delete("/allowlist/:email", asyncH(async (req, res) => {
  const email = normalizeEmail(req.params.email);
  await q(`DELETE FROM allowlist WHERE email = $1`, [email]);
  await q(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [email]);
  res.json({ ok: true });
}));

// ---------- Bulk add: rows pasted from Excel (Form responses) ----------
// Each line: name and email in either order, tab- or comma-separated. Header rows and blank lines are skipped.
export function parseBulk(text: string) {
  const rows: { line: number; email: string; name: string | null }[] = [];
  const invalid: { line: number; value: string }[] = [];
  let first = true;
  text.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const isFirst = first;
    first = false;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/[,;]/)).map((c) => c.trim().replace(/^"|"$/g, "").trim());
    const at = cells.findIndex((c) => c.includes("@"));
    if (at < 0) {
      // The header row ("Name  Email") is skipped silently; any other line without an email is reported
      if (!(isFirst && /e-?mail|name/i.test(line))) invalid.push({ line: i + 1, value: line.slice(0, 80) });
      return;
    }
    const email = normalizeEmail(cells[at].replace(/^.*<([^>]+)>.*$/, "$1"));
    if (!isValidEmail(email)) { invalid.push({ line: i + 1, value: cells[at].slice(0, 80) }); return; }
    const name = cells.filter((c, j) => j !== at && c && !c.includes("@")).join(" ").slice(0, 120) || null;
    rows.push({ line: i + 1, email, name });
  });
  return { rows, invalid };
}

adminRouter.post("/allowlist/bulk", asyncH(async (req, res) => {
  const body = z.object({ text: z.string().max(500_000), dryRun: z.boolean().default(true) }).parse(req.body);
  const { rows, invalid } = parseBulk(body.text);
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)));
  const existing = unique.length
    ? new Set((await q<{ email: string }>(`SELECT email FROM allowlist WHERE email = ANY($1)`, [unique.map((r) => r.email)])).rows.map((r) => r.email))
    : new Set<string>();
  const toAdd = unique.filter((r) => !existing.has(r.email));
  const summary = {
    toAdd, invalid,
    duplicates: rows.length - toAdd.length,
    alreadyOnList: unique.filter((r) => existing.has(r.email)).map((r) => r.email),
    repeatedInPaste: rows.length - unique.length,
  };
  if (body.dryRun) return res.json({ dryRun: true, ...summary });
  let added = 0;
  for (const r of toAdd) {
    const ins = await q(`INSERT INTO allowlist (email, name, source) VALUES ($1, $2, 'manual') ON CONFLICT (email) DO NOTHING`, [r.email, r.name]);
    added += ins.rowCount ?? 0;
  }
  res.json({ dryRun: false, added, ...summary });
}));

function findCol(headers: string[], needles: string[], override?: string) {
  if (override) return headers.findIndex((h) => h.trim().toLowerCase() === override.trim().toLowerCase());
  for (const n of needles) {
    const i = headers.findIndex((h) => h.toLowerCase().includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

adminRouter.post("/allowlist/csv", asyncH(async (req, res) => {
  const body = z.object({
    csv: z.string().max(2_000_000), dryRun: z.boolean().default(true),
    emailColumn: z.string().optional(), nameColumn: z.string().optional(),
  }).parse(req.body);
  const records: string[][] = parse(body.csv.replace(/^﻿/, ""), { skip_empty_lines: true, relax_column_count: true, trim: true });
  if (records.length < 2) return res.status(400).json({ error: "CSV needs a header row and at least one data row" });
  const headers = records[0];
  const ei = findCol(headers, ["email"], body.emailColumn);
  // Prefer a "name" column that is not the email column
  const ni = findCol(headers.map((h, i) => (i === ei ? "" : h)), ["name"], body.nameColumn);
  const ti = findCol(headers, ["completion time", "start time"]);
  if (ei < 0) return res.status(400).json({ error: "Could not find an email column", headers });

  const seen = new Set<string>();
  const valid: { email: string; name: string | null; submittedAt: Date | null }[] = [];
  const invalid: { row: number; value: string }[] = [];
  let duplicatesInFile = 0;
  records.slice(1).forEach((r, idx) => {
    const email = normalizeEmail(r[ei]);
    if (!isValidEmail(email)) { invalid.push({ row: idx + 2, value: r[ei] ?? "" }); return; }
    if (seen.has(email)) { duplicatesInFile++; return; }
    seen.add(email);
    const t = ti >= 0 && r[ti] ? Date.parse(r[ti]) : NaN;
    valid.push({ email, name: ni >= 0 ? r[ni] || null : null, submittedAt: isNaN(t) ? null : new Date(t) });
  });
  const existing = valid.length
    ? new Set((await q<{ email: string }>(`SELECT email FROM allowlist WHERE email = ANY($1)`, [valid.map((v) => v.email)])).rows.map((r) => r.email))
    : new Set<string>();
  const summary = {
    columns: { email: headers[ei], name: ni >= 0 ? headers[ni] : null, time: ti >= 0 ? headers[ti] : null },
    totalRows: records.length - 1, valid: valid.length, invalid, duplicatesInFile,
    new: valid.filter((v) => !existing.has(v.email)).length,
    alreadyPresent: valid.filter((v) => existing.has(v.email)).length,
    sample: valid.slice(0, 10),
  };
  if (body.dryRun) return res.json({ dryRun: true, ...summary });
  for (const v of valid) {
    await q(`INSERT INTO allowlist (email, name, source, submitted_at) VALUES ($1, $2, 'csv', $3)
             ON CONFLICT (email) DO UPDATE SET name = COALESCE(allowlist.name, EXCLUDED.name)`, [v.email, v.name, v.submittedAt]);
  }
  res.json({ dryRun: false, imported: summary.new, ...summary });
}));

