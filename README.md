# FloodWatch BD 🌊

A live, citizen-powered flood map for **Bangladesh**. Anyone can see flooded areas
in real time and report new ones in seconds — by GPS or by tapping the map — and the
community keeps the map trustworthy by confirming or disputing each report.

The map is clamped to Bangladesh, floods render as a blue density heatmap (the darker
and larger the blob, the more reports and the deeper the water), and everything is
shared live across everyone viewing the map.

---

## Features

- **Live flood map** — OpenStreetMap/CARTO base tiles, hard-clamped to Bangladesh
  (`maxBounds`), zoom 6.4 → 19 (street level).
- **Density heatmap** — more reports render darker; deeper water renders darker; blob
  radius scales with zoom so each report keeps a roughly constant real-world footprint.
- **Report a flood** — GPS (auto) or manual pin. Optional water depth
  (Ankle / Knee / Waist / Above) and note. A short per-device cooldown prevents spam.
- **Verify any report** — tap a report pin anywhere to see its detail and mark it
  **Still flooded** or **Cleared now**. A report becomes *verified* after 2
  confirmations and is removed after 2 disputes (one vote per device per report).
- **Monitored areas** — known flood-prone districts (Sunamganj, Sylhet, Kurigram)
  are tappable for an area-level overview and confirm/dispute.
- **Search** — instant search across all 64 Bangladesh districts plus geocoded
  sub-district areas, neighbourhoods, and landmarks (via a cached OSM proxy).
- **No account, no local data** — anyone can view and contribute. Reports and votes
  are server-authoritative; nothing sensitive is stored in the browser.
- **Shared & live** — a 30-second poll keeps every open map in sync.

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) + **React 19** + **TypeScript**
- **[Tailwind CSS v4](https://tailwindcss.com)** + **shadcn/ui** (base-nova) + **Lucide** icons
- **[Leaflet](https://leafletjs.com)** + **react-leaflet** + **leaflet.heat**
- **[Upstash Redis](https://upstash.com)** for shared storage (the successor to Vercel KV)
- **[Bun](https://bun.sh)** as the package manager / runtime
- Fonts: **Hanken Grotesk** + **IBM Plex Mono** via `next/font`

## Getting started

```bash
# with npm
npm install
npm run dev

# or with Bun (the repo ships a bun.lock)
bun install
bun run dev
```

(`yarn` and `pnpm` work too — `yarn dev`, `pnpm dev`.)

Open [http://localhost:3000](http://localhost:3000).

The app **runs out of the box with no configuration** — without database
credentials it uses an in-memory store (shared across tabs on the dev server, reset
on restart). To make the map genuinely shared and persistent, add Upstash Redis
credentials.

### Environment (optional, for a real shared database)

Create a free [Upstash Redis](https://upstash.com) database (no credit card required —
via the Vercel dashboard → Storage → Upstash, or the Upstash console) and add a
`.env` (or `.env.local`) file:

```bash
KV_REST_API_URL=https://your-db.upstash.io
KV_REST_API_TOKEN=your-token
# Upstash also exposes these as UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — either pair works.
```

Restart the dev server. The map is now shared across all users and survives restarts.

## Scripts

Use `npm run <script>` (or `bun run`, `yarn`, `pnpm`):

| Command | Description |
| --- | --- |
| `dev` | Start the dev server (Turbopack) |
| `build` | Production build |
| `start` | Serve the production build |
| `lint` | Run ESLint |
| `reset` | Dry-run: list the `fw:*` keys that would be deleted |
| `reset --yes` | Wipe all reports/votes → the map starts empty |

> **Note:** `reset` runs a TypeScript script and reads `.env`, so it needs **Bun**
> (`bun run reset`). Everything else works with any package manager.

## API

All routes are server-side; the browser only talks to same-origin `/api/*`.

| Method & path | Body / query | Purpose |
| --- | --- | --- |
| `GET /api/reports` | — | `{ reports, votes, myVotes }` — recent reports + area vote tallies |
| `POST /api/reports` | `{ lat, lng, depth?, note? }` | Create a report (validated, rate-limited, BD-only) |
| `POST /api/votes` | `{ reportId, kind }` | Confirm/dispute a specific report |
| `POST /api/votes` | `{ region, kind }` | Confirm/dispute a monitored area |
| `GET /api/geocode` | `?q=<query>` | Bangladesh area search (cached OSM proxy) |

`kind` is `"confirmed"` or `"disputed"`.

## Project structure

```
app/
  page.tsx              # server component — SSR initial reports → <MapApp/>
  layout.tsx            # fonts, metadata, viewport
  globals.css           # Tailwind v4 theme + FloodWatch design tokens
  error.tsx             # error boundary
  api/
    reports/route.ts    # GET (feed) + POST (create)
    votes/route.ts      # region + per-report voting
    geocode/route.ts    # OSM/Nominatim proxy (cached, rate-limited)
components/floodwatch/
  MapApp.tsx            # client root: provider + dynamic(ssr:false) map + overlays + sheets
  map/                  # FloodMap, HeatLayer, ReportPins, MapControls
  overlays/             # Onboarding, TopBar (search + filters), ReportButton, PlacingBanner
  sheets/               # report flow, area detail, report detail, filters
lib/floodwatch/
  store.tsx             # React context + reducer, live polling, geolocation
  geo.ts                # BD bounds, regions, distance/filter helpers
  districts.ts          # 64 districts for search
  server/store.ts       # Upstash Redis adapter (+ in-memory fallback), voting logic
next.config.ts          # security headers (CSP, HSTS, X-Frame-Options, …)
scripts/reset.ts        # `bun run reset`
```

## Security & privacy

- Strict **Content-Security-Policy** plus `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and HSTS (`next.config.ts`).
- All input is validated server-side (coordinates must be inside Bangladesh, depth is
  whitelisted, notes are length-capped and stripped of HTML).
- Anti-abuse via per-IP rate limits (report cooldown, geocode budget) and per-IP,
  per-report/area vote de-duplication. Report storage is client-agnostic and holds no
  personal data.

> IP-based limiting is best-effort for a no-account public app; for higher-traffic
> deployments consider adding CAPTCHA/auth and a keyed geocoding provider.

## Deploy

Deploys to [Vercel](https://vercel.com) as a standard Next.js app. Add the
`KV_REST_API_URL` / `KV_REST_API_TOKEN` environment variables (the Upstash Marketplace
integration sets them automatically), then deploy.
