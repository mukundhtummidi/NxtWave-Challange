# Your Hall Ticket — PRD

## Original problem statement
Mobile-first web app "Your Hall Ticket" for a free online workshop "Build Your First AI Project in 60 Minutes" (3rd/4th year engineering students, India). Registration feels like receiving an exam hall ticket. Pages: `/` (landing + form + live ticket preview), `/ticket/:seatCode` (public shareable, OG tags), `/board` (campus board, 25-registration goal, live ranking every 10s). Real DB-backed registration + referral attribution, duplicate/self-referral prevention, rate limiting, sanitization, college-name normalization, WhatsApp share with 3 tones, 1080x1920 PNG download, ~60 demo registrations flagged `is_demo`, admin PIN toggle. Paper exam-hall design (ink blue / stamp red / highlighter yellow), Space Grotesk + JetBrains Mono, dark mode, reduced-motion, focus states, great at 360px. Footer: "Concept prototype built for a growth challenge". No affiliation claims, no fake testimonials/counts/logos.

## User choices
- Workshop date/time: `Sat, 17 Oct 2026 · 6:00 PM IST` — single config value in `/app/backend/config.py` (`WORKSHOP["datetime_label"]`). Duration label: `60 minutes · Online (joining link shared before the session)`.
- No emails are sent by the app (no email confirmation). Copy nowhere says or implies an email is sent.
- Board: "Unlocked: free project template pack" label is kept, with a note under it: "Prototype: pack delivery is not built yet."
- Admin PIN protection (PIN in `backend/.env` → `ADMIN_PIN`, see `/app/memory/test_credentials.md`).
- OG previews: yes (backend-served `/api/share/:code` page with OG tags + auto-generated OG image, redirects humans to `/ticket/:code`).
- Fonts: Space Grotesk + JetBrains Mono (local TTFs via expo-font).

## Architecture
- **Frontend**: Expo Router (RN Web + Expo Go). Routes: `app/index.tsx`, `app/ticket/[seatCode].tsx`, `app/board.tsx`. Components in `src/components` (HallTicket w/ Reanimated stamp, CollegePicker modal, ChipRow, ShareSheet, Button w/ focus ring, Toast, Header w/ dark toggle, Footer). Theme tokens in `src/theme.ts` (light+dark, web-safe scheme override). Referral capture in `src/referral.ts` (first touch wins, persisted).
- **Backend**: FastAPI `server.py` + `config.py` (editable workshop config), `projects.py` (12 interest×branch projects), `colleges.py` (~330 colleges + alias/fuzzy normalization), `render.py` (Pillow OG 1200x630 + story 1080x1920 PNG).
- **DB**: Mongo `registrations` (unique `seat_code`, unique `email_norm`, `college_key`, `referred_by`, `source`, `is_demo`, `deleted_at`), `settings` (`demo_hidden`).
- Endpoints: `GET /api/config|colleges|projects|board`, `POST /api/register`, `GET /api/tickets/{code}`, `GET /api/tickets/{code}/og.png|story.png`, `GET /api/share/{code}`, `POST /api/admin/demo-visibility`, `POST /api/admin/verify`.

## Simplifications (told to user)
- "Download as image" is rendered server-side (Pillow) as a 1080x1920 PNG rather than client-side screenshot — reliable on web + native, identical fonts.
- Rate limit is in-memory per IP (12 attempts / 10 min) — resets on backend restart.
- Admin toggle is global (hides demo data for every visitor), stored in DB.

## Implemented (2026-06)
- All 3 pages, live preview, registration, stamp animation, referral attribution (ref/rep/utm), dedupe, self-referral guard, sanitization, rate limit, normalization, board w/ 10s refresh + unlock state + Demo data labels + admin PIN toggle, WhatsApp share (3 tones), PNG download, OG share page, dark mode, reduced motion, focus rings, 60 demo seeds.
- Testing: iteration_1 — backend 18/18, frontend all flows pass.

### Phase 2 (2026-06)
- **Campus reps**: `reps` collection, `GET /api/reps/{code}` (total, direct vs via referral chain via BFS over `referred_by`, 14-day trend, rank among reps, link `/?rep=CODE&utm_source=whatsapp`, recent seats). `/rep/[repCode]` dashboard w/ SVG trend line, copy link, 3 rep-voice WhatsApp tones. 5 demo reps seeded (is_demo) and demo registrations re-attributed (rep / student referral chains / instagram / club / direct, spread over 12 days).
- **/admin**: `ADMIN_PASSWORD` + `JWT_SECRET` in backend/.env, 7-day HS256 JWT (`auth.py`), token in secure storage; `GET /api/admin/stats` (totals real/demo, sources by utm bucket, per-day stacked bars, top colleges, top reps, funnel from `events` collection, viral coefficient K = referred/all, longest chain), `GET /api/admin/export.csv` (header or `?token=`), projection panel (reps × friends × geometric K over 5 generations, formula shown; compared with measured K).
- **Events**: `POST /api/events` (page_view, form_started, share_clicked; registered counted from DB). Session-deduped.
- Simplifications told to user: funnel counts page views/form starts once per browser session; "Registered" step uses DB registrations (last 30 days) not events; projection assumes each share brings one friend (K = share rate).
- Testing: iteration_2 — backend 19/19, frontend all pass. Fixed tz-naive/aware datetime bug by `tz_aware=True` on Motor client.

### Tone tracking (2026-06)
- `share_clicked` events carry `tone` (casual | placement | funny; keys = `src/share.ts` TONES). Backend validates on share_clicked only (422 on unknown), ignores tone on other event types, missing tone allowed. Other event types unchanged.
- `GET /api/admin/stats.shares_by_tone` → `{real[], real_total, real_untagged, demo[], demo_total, note}` with count + pct per tone; real and demo kept separate; `include_demo=false` empties demo. Funnel now excludes `is_demo` events.
- Demo: 18 `share_clicked` events seeded on startup, 6 per tone (deliberately equal — no invented winner), `is_demo=true`, spread over 12 days.
- `/admin` "Shares by tone" panel: real bars, "Demo data · 18 seeded shares" block (hidden under "Real only"), note "Counts only; not a conclusion about which tone works better."
- Tests: `backend/tests/test_tone.py` (validation + stats). `tests/conftest.py` loads `.env` so suites use live ADMIN_PASSWORD/ADMIN_PIN/BASE_URL; rate-limit test moved to `test_zz_rate_limit.py`. Full suite 52/52 (run per module with backend restart — register limit is 12/10 min per IP). Frontend verified by testing agent (iteration_3).

### Public demo admin (2026-06)
- `/admin-demo` (public, read-only): same dashboards as `/admin` fed by `GET /api/admin-demo/stats`, which filters to `is_demo=True` registrations, demo reps and demo events *before* aggregation (`compute_stats(..., demo_only=True)`). No login, no CSV, no scope toggle, no "Real" KPI; banner "Demo data, read-only". `/admin` remains JWT-locked.
- Shared `src/components/StatsPanels.tsx` renders every panel for both pages (`demoOnly` prop).
- Tests: `backend/tests/test_admin_demo.py` incl. registering a marked real student and asserting name/email/seat/college never reach the demo stats. Full suite 61/61. Frontend verified by testing agent (iteration_4).

### Clipboard fix (2026-06)
- Shared `src/clipboard.ts` → `copyText(text): Promise<boolean>`: web `navigator.clipboard.writeText` → fallback hidden `<textarea>` + `execCommand("copy")` (always removed) → native `expo-clipboard` (`~57.0.2`). True only on real success.
- Used by ShareSheet (Copy link + new **Copy message**) and `/rep/[code]` (Copy my link). Toasts: "Link copied" / "Message copied"; failure (error style): "Couldn't copy. Press and hold the link below to copy it". Raw link never shown as toast; link text + message preview selectable.
- Manual steps: `frontend/tests/clipboard.manual.md`. Verified by testing agent (iteration_5).

### Tone tracking v2 — message copies (2026-06)
- New event type `message_copied` (sent by "Copy message" after a successful copy, with tone). Tone validated on `share_clicked` + `message_copied` only (422 on unknown); other events unchanged; funnel unchanged.
- `shares_by_tone` rows are now `{tone, label, shares, copies, total, pct}` (pct = total ÷ sum of totals). Real and demo separate; demo respects `include_demo`.
- Demo seed per event type (idempotent per type): 6 shares + 4 copies per tone = 30 events, `is_demo=true`.
- Panel sub-text: "<n> WhatsApp · <m> copied · <p>% of real|demo". Backend suite 67/67; frontend verified (iteration_6).

## Backlog
- P1: Campus-rep dashboard (per `rep` code counts) and per-source analytics.
- P2: Template-pack delivery flow when a college unlocks (currently a prototype note on the board); CSV export for organiser.
- P2: `<a href>` for WhatsApp CTA on web (currently Linking/window.open).

## 2026-06 · Responsive desktop layouts
- Added shared layout helper `src/responsive.tsx` (`useBreakpoint`, `PageContainer`).
- Header: centered max-width 1200, wide-only Share link.
- Wide (>=768px) multi-column layouts for /board, /ticket/:code, /rep/:code, /admin, /admin-demo; up to 1100px wide. 360px mobile layout unchanged.

## 2026-06 · Multi-platform sharing + per-platform referral tracking
- Share link is now the backend share page {base}/api/share/{SEAT}?via={channel}; it redirects humans to {base}/?ref={SEAT}&via={channel} (registration form), not /ticket/.
- `via` captured first-touch in src/referral.ts, stored on registration as share_channel (allowed: whatsapp, telegram, linkedin, x, facebook, instagram, email, native, copy; unknown -> null).
- ShareSheet: WhatsApp/Telegram/X/Email (intents), LinkedIn/Facebook (copy text + open), Instagram (save story + copy link), More… (Web Share where available).
- share_clicked events accept optional validated `channel` (unknown -> 422). New admin/admin-demo "Shares and registrations by platform" panel; share_channel added to CSV.
- Backend tests: tests/test_channel.py (23). Updated test_hallticket share-HTML redirect assertion + tightened test_admin_demo PII check.
