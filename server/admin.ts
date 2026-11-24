import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { q } from "./db";
import { normalizeEmail, isValidEmail, safeEqual, asyncH } from "./util";
import { requireAdmin } from "./auth";
import { codeEmailHtml, sendCodeEmail } from "./email";

// ---------- Power Automate webhook ----------
export const hookRouter = Router();

hookRouter.post("/form-response", asyncH(async (req, res) => {
  const secret = process.env.FORM_WEBHOOK_SECRET;
  const given = req.get("x-webhook-secret") ?? "";
  if (!secret || !safeEqual(given, secret)) return res.status(401).json({ error: "Unauthorized" });

  const b = req.body ?? {};
  const email = normalizeEmail(b.email ?? b.responder ?? b.Email);
  if (!isValidEmail(email)) {
    console.warn("[webhook] rejected invalid email");
    return res.status(400).json({ error: "Invalid email" });
  }
  const name = b.name ? String(b.name).slice(0, 120) : null;
  const submittedAt = b.submittedAt && !isNaN(Date.parse(b.submittedAt)) ? new Date(b.submittedAt) : new Date();
  await q(
    `INSERT INTO allowlist (email, name, source, response_id, submitted_at) VALUES ($1, $2, 'form', $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, allowlist.name),
       response_id = COALESCE(EXCLUDED.response_id, allowlist.response_id),
       submitted_at = EXCLUDED.submitted_at,
       source = CASE WHEN allowlist.source = 'admin' THEN 'admin' ELSE 'form' END`,
    [email, name, b.responseId ? String(b.responseId).slice(0, 100) : null, submittedAt]);
  console.log(`[webhook] form response accepted (${email.replace(/(.{2}).*@/, "$1***@")})`);
  res.json({ ok: true });
}));

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
  const body = z.object({ email: z.string(), name: z.string().max(120).optional() }).parse(req.body);
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });
  await q(`INSERT INTO allowlist (email, name, source) VALUES ($1, $2, 'manual')
           ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, allowlist.name)`, [email, body.name || null]);
  res.json({ ok: true });
}));

adminRouter.delete("/allowlist/:email", asyncH(async (req, res) => {
  await q(`DELETE FROM allowlist WHERE email = $1`, [normalizeEmail(req.params.email)]);
  res.json({ ok: true });
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

adminRouter.get("/email-preview", (req, res) => {
  res.type("html").send(codeEmailHtml("482913", process.env.APP_URL || `${req.protocol}://${req.get("host")}`));
});

adminRouter.post("/test-email", asyncH(async (req, res) => {
  await sendCodeEmail(req.user!.email, "123456", process.env.APP_URL || `${req.protocol}://${req.get("host")}`);
  res.json({ ok: true, to: req.user!.email });
}));
