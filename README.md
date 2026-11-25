# ♠ Poker at Thiv's

Companion app for the Optimus Day poker night (Fri Nov 27 · No-Limit Hold'em · 8 seats).

**Phase 1:** an odds calculator, gated so only people who filled out the RSVP form can sign in.

- **Email gate:** a guest list the hosts manage in `/admin` (paste the Form responses from Excel). Players type the email they used on the form and they're in, with a 30-day session. Anyone else sees *"You're not on the list… yet"* with a link to the form. Removing someone ends their access immediately.
- **Odds engine:** runs on the phone in a Web Worker.
  - Win/tie/lose: exact for heads-up after the flop, otherwise simulated, with results refining on screen.
  - A plain-English verdict (Strong / Above average / About average / Below average) against an average hand's share at your table size.
  - Step prompts ("Add the flop when it comes"). Tap a placed card to select it and tap a new card to replace it; tap it again to clear it.
  - Your current hand, your outs grouped by the hand they make (next-card % and by-river %), and the chance of finishing with each hand type.
  - **What-if heatmap:** every possible next card is shaded by how it changes your equity.
- **Admin page** (`/admin`): admin emails plus `ADMIN_PASSWORD`. Bulk-paste Name + Email rows from Excel (preview first; duplicates skipped), add one person, edit names, remove people, or import a CSV.
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
   | `FORM_URL` | Microsoft Form share link |
   | `SESSION_PEPPER` | another long random string |

4. **Run:** press *Run*. It installs, builds and serves on port 3000. Sign in with your admin email, tap *Admin*, and enter `ADMIN_PASSWORD`.
5. **Deploy:** *Deploy* → *Autoscale*. Build and run commands are already set in `.replit` (`npm install && npm run build` / `npm start`). Make sure the Secrets and the database are attached to the deployment.

## Adding guests (manual, from the Form)
1. Microsoft Forms → *Responses* → *Open results in Excel*.
2. Select the **Name** and **Email** columns (header included is fine) → copy.
3. App → *Admin* → **Bulk add from the Form** → paste → *Preview* → *Add N people*.
4. Re-paste the whole sheet any time someone new RSVPs; people already on the list are skipped.

Either host can do this from a phone. Check the responses a few times before Friday and once before the game.

## Local development
```bash
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run dev            # API on :3000, Vite on :5173 (proxied)
npm test               # engine tests (exhaustive 5-card counts, AA vs KK, outs, etc.) + paste parser
npm run bench          # evaluator speed (~8M 7-card hands/sec in Node)
```

## API
| Route | Notes |
|---|---|
| `POST /api/auth/login` `{email}` | `ok` (sets `sid` cookie) / `not_registered` (+formUrl) / `rate_limited` (30 per 10 min per IP) |
| `POST /api/auth/admin-unlock` `{password}` | admin emails only; unlocks `/api/admin/*` for that session |
| `GET /api/auth/me`, `POST /api/auth/logout` | |
| `GET/POST /api/admin/allowlist`, `PATCH/DELETE /api/admin/allowlist/:email` | admins only; adding an existing email returns 409; delete also ends that person's sessions |
| `POST /api/admin/allowlist/bulk` `{text, dryRun}` | pasted rows; preview of to-add / duplicate / invalid |
| `POST /api/admin/allowlist/csv` | CSV import (admins only) |

## Phase 2 ideas (already prepared for)
`users` table exists for the leaderboard. Sign-in is email-only, so record leaderboard results host-side (you or Nas enter chip counts) rather than letting players self-report; the engine (`src/engine`) is pure TS and can drive a rule-based coach (preflop charts + pot odds vs equity) and a practice mode.
