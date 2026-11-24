# ♠ Poker at Thiv's

Companion app for the Optimus Day poker night (Fri Nov 27 · No-Limit Hold'em · 8 seats).

**Phase 1:** an odds calculator, gated so only people who filled out the RSVP form can sign in.

- **Email gate:** an allowlist synced from the Microsoft Form via Power Automate. Players type the email they used on the form and they're in, with a 30-day session. Anyone else sees *"You're not on the list… yet"* with a link to the form. Removing someone from the list revokes their access immediately.
- **Odds engine:** runs on the phone in a Web Worker.
  - Win/tie/lose: exact for heads-up after the flop, otherwise simulated, with results refining on screen.
  - Your current hand, your outs grouped by the hand they make (next-card % and by-river %), and the chance of finishing with each hand type.
  - **What-if heatmap:** every possible next card is shaded by how it changes your equity.
- **Admin page** (`/admin`): admin emails plus `ADMIN_PASSWORD`. View the allowlist, add or remove people, import the Forms CSV.
- **PWA:** installs to the home screen, and the app shell is cached for flaky Wi-Fi.
- **iPhone-tested layouts:** SE (375pt) to Pro Max (430pt). No sideways scrolling, inputs at 16px+ so Safari doesn't zoom, double-tap zoom disabled on the card grid, safe-area insets respected.

## Stack
React + Vite + TypeScript · Express 5 · PostgreSQL (`pg`) · Vitest.
The schema is created automatically when the server starts (`server/db.ts`), so there's no migration step.

## Deploy on Replit (≈15 min)
1. **Import:** Replit → *Create App* → *Import from GitHub* → `thivian17/PokerAtThivs`.
2. **Database:** Tools → *Database* → create a PostgreSQL database. This sets `DATABASE_URL` automatically.
3. **Secrets:** Tools → *Secrets*, add:

   | Secret | Value |
   |---|---|
   | `ADMIN_EMAILS` | `you@optimussbr.com,nas@optimussbr.com` |
   | `ADMIN_PASSWORD` | password you and Nas use to open `/admin` |
   | `FORM_WEBHOOK_SECRET` | long random string (also goes into Power Automate) |
   | `FORM_URL` | Microsoft Form share link |
   | `SESSION_PEPPER` | another long random string |

4. **Run:** press *Run*. It installs, builds and serves on port 3000. Sign in with your admin email, tap *Admin*, and enter `ADMIN_PASSWORD`.
5. **Deploy:** *Deploy* → *Autoscale*. Build and run commands are already set in `.replit` (`npm install && npm run build` / `npm start`). Make sure the Secrets and the database are attached to the deployment.

## Power Automate (form → instant access)
1. make.powerautomate.com → *Create* → *Automated cloud flow* → trigger **When a new response is submitted** (Microsoft Forms) → choose the form.
2. **Get response details**: Form Id = same form, Response Id = *Response Id* (dynamic content).
3. **HTTP** action:
   - Method `POST`, URI `https://<your-app>.replit.app/api/hooks/form-response`
   - Headers: `Content-Type: application/json`, `X-Webhook-Secret: <FORM_WEBHOOK_SECRET>`
   - Body (insert the dynamic tokens from the picker):
     ```json
     { "email": "<Responders' Email>", "name": "<Name question or Responders' Name>",
       "responseId": "<Response Id>", "submittedAt": "<Submission time>" }
     ```
4. Save, submit a test response, and confirm it shows in `/admin` with source **form**.
5. **Backfill existing responses:** Forms → Responses → *Open results in Excel* → Save As CSV → `/admin` → import. Duplicates are skipped, so re-importing is safe.

If your company's settings block the HTTP action from reaching an outside URL, use the CSV import until IT allows it.

## Local development
```bash
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run dev            # API on :3000, Vite on :5173 (proxied)
npm test               # engine tests (exhaustive 5-card counts, AA vs KK, outs, etc.)
npm run bench          # evaluator speed (~8M 7-card hands/sec in Node)
```

## API
| Route | Notes |
|---|---|
| `POST /api/auth/login` `{email}` | `ok` (sets `sid` cookie) / `not_registered` (+formUrl) / `rate_limited` (30 per 10 min per IP) |
| `POST /api/auth/admin-unlock` `{password}` | admin emails only; unlocks `/api/admin/*` for that session |
| `GET /api/auth/me`, `POST /api/auth/logout` | |
| `POST /api/hooks/form-response` | Power Automate webhook, `X-Webhook-Secret` header |
| `GET/POST/DELETE /api/admin/allowlist…`, `POST /api/admin/allowlist/csv` | admins only |

## Phase 2 ideas (already prepared for)
`users` table exists for the leaderboard. Sign-in is email-only, so record leaderboard results host-side (you or Nas enter chip counts) rather than letting players self-report; the engine (`src/engine`) is pure TS and can drive a rule-based coach (preflop charts + pot odds vs equity) and a practice mode.
