# FloodWatch BD — Build Log

Citizen flood-reporting map for Bangladesh. Mobile-first web app, responsive to desktop.
Built on the design handoff (`Flood App Mobile.dc.html` + `README.md`).

## Done
- [x] Deps: `leaflet`, `react-leaflet@5`, `leaflet.heat` (+ `@types/leaflet`, local `types/leaflet.heat.d.ts`)
- [x] Fonts (Hanken Grotesk + IBM Plex Mono) + FloodWatch palette tokens in `app/globals.css`; metadata/viewport
- [x] Data layer: `lib/floodwatch/` — `types.ts`, `geo.ts` (BD bounds/regions/filters), `seed.ts` (deterministic seed reports), `useLocalStorage.ts` (useSyncExternalStore-backed), `store.tsx` (context + reducer + geolocation + cooldown)
- [x] Map: `components/floodwatch/map/` — `FloodMap` (CARTO tiles, BD `maxBounds`), `HeatLayer` (leaflet.heat density), `ReportPins` (region markers + amber pins), `MapControls` (legend + zoom)
- [x] Overlays + sheets: onboarding, top bar, report button, placing banner, report-mode/locating/details/done, area detail, filters. Responsive: bottom sheet on mobile → left-docked panel on desktop
- [x] `MapApp` client root (dynamic `ssr:false` map) + `app/page.tsx`

## Verified end-to-end (Browser pane, DOM/state inspection)
- Onboarding → map; skips on reload (localStorage `fw_onboarded`)
- Real CARTO map, 15 tiles loaded; **clamped to Bangladesh** (setView to lat 40 snaps back inside bbox; viscosity 1, minZoom 6.4)
- Region markers with live counts → area sheet; confirm/dispute vote persists + blocks re-vote
- Filters: time range updates legend + chip; verified toggle
- Report flow: manual pin drop (valid BD coords) → depth + note (no photo) → submit → done → amber unverified pin, persisted
- Cooldown: immediate re-submit blocked with "wait about 3 minutes" message
- Desktop (1280×800): map fills viewport, sheet becomes 380px left panel
- `tsc --noEmit` and `eslint` both clean

## Scope decisions
- Image upload removed (report photo picker + area photo strip)
- Fake phone status bar dropped; "EN" label left static

---

# Phase 2 — Shared live backend (Upstash Redis)

Moved reports from per-device localStorage to a shared server datastore so the map is genuinely
live/public across users. Storage = Upstash Redis (successor to Vercel KV), free tier.

## Done
- [x] `@upstash/redis`; server adapter `lib/floodwatch/server/store.ts` — Upstash via `Redis.fromEnv`
      when `KV_REST_API_URL`/`KV_REST_API_TOKEN` set, else in-memory fallback (dev, shared across tabs).
      Reports in a Redis List (append/read = 1 command each); lazy seed; IP cooldown via `SET NX EX`.
- [x] `app/api/reports/route.ts` — GET (recent) / POST (validate bounds + rate-limit + persist)
- [x] Client `store.tsx` now server-backed: SSR initial reports from `page.tsx`, fetch + 30s poll,
      POST submit with 201/429/422 handling, `fw_mine` tracks own reports (amber pins)
- [x] Fixed `HeatLayer` `IndexSizeError` (leaflet.heat drawing on a 0-size canvas when the map mounts
      before layout) — guard on `map.getSize()` + retry on resize

## Verified
- API: 201 / 429 (same IP) / 422 (out of bounds)
- UI submit persists to the shared store (id confirmed via GET)
- **Live**: a report added by another client appeared in an open tab within the poll interval
  (Kurigram 1→2, no reload)
- Server-enforced cooldown surfaced in the UI; `tsc` + `eslint` clean

## Setup needed from user (free, no credit card)
- Create an Upstash Redis DB (Vercel → Storage → Upstash, or upstash.com), paste
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` into `.env.local`, restart dev. Until then the in-memory
  fallback runs everything locally.

---

# Phase 3 — Server-side voting + zero localStorage

Moved the last client-side state to the server so **nothing** is stored locally.

## Done
- [x] Server voting in `lib/floodwatch/server/store.ts`: `castVote` (per-IP dedup via `SET NX`,
      tallies via `HINCRBY`) + `getVotes(ip)` (shared tallies + this IP's own votes)
- [x] `app/api/votes/route.ts` (POST); `/api/reports` GET now returns `{reports, votes, myVotes}`
- [x] Client `store.tsx`: votes/tallies/myVotes from server, optimistic vote POST; **onboarding is
      in-memory only** (shown once per load); removed `fw_mine` (amber pins = all unverified reports);
      deleted `useLocalStorage.ts` — no localStorage anywhere
- [x] AreaSheet shows shared confirm/dispute tallies on the buttons
- [x] Fixed Upstash `hgetall` flat-array return under `automaticDeserialization:false`

## Verified (with real Upstash creds in `.env`)
- Upstash connected (no in-memory warning) and **persistent**: a report survived a full server restart
- Voting API: 201 cast / 409 dup (same IP) / 400 invalid region; tally shared across IPs, `myVotes` per-IP
- UI vote → server tally 1→2, buttons disable, confirmation message
- **Vote remembered after reload with localStorage completely empty** (server-tracked by IP)
- `tsc` + `eslint` clean

## Notes
- `.env` holds `KV_REST_API_URL` / `KV_REST_API_TOKEN` (gitignored). Deleted the empty `.env.local`
  that would otherwise override them.
- Test data (a "persist-check" report + a few Kurigram votes) is in the live Upstash DB; harmless, can
  be flushed if a clean slate is wanted.

---

# Phase 4 — Search + production hardening & security audit

## Done
- [x] Search bar wired to a bundled 64-district dataset (`lib/floodwatch/districts.ts`) → fly-to.
- [x] `focusOn` no longer crashes on a 0-size map (`flyTo` → `setView` fallback + size guard).
- [x] **Security fixes**:
  - `clientIp` hardened — prefer `x-real-ip`, else **rightmost** XFF, length-capped (was leftmost XFF
    = spoofable → cooldown/vote bypass). Verified live: spoofed leftmost no longer bypasses (429).
  - `note` sanitized server-side (strip `<>`) — defense-in-depth for latent stored-XSS. Verified.
  - Security headers in `next.config.ts`: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy,
    Permissions-Policy (geolocation self-only), HSTS. Verified present + no CSP violations.
  - Error boundary: `app/error.tsx` + `app/global-error.tsx`.
- [x] Audit passed: `next build` clean; API fuzzing (malformed/oversized/XSS/proto-pollution/bounds)
      all handled correctly on both endpoints; no XSS surface (notes unrendered, divIcons static);
      KV secrets imported only server-side.

## Residual (not blockers)
- IP limiting is best-effort (no auth) — CAPTCHA/auth needed for real abuse resistance.
- `/api/reports` GET uncached (per-IP myVotes), ~5 Redis cmds/poll/client — fine on free tier.

## Possible follow-ups
- Swap 30s polling for SSE/websockets for instant updates.
- Address-level search (villages/landmarks) would need a geocoding service.
- a11y pass on focus order (prefers-reduced-motion already honored).
