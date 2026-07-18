# Lessons

## Leaflet map + HTML overlays: z-index needs a stacking context
Leaflet's internal panes use high z-indexes (tile 200, overlay 400, marker 600). If the map's
wrapper is positioned with `auto`/no z-index, it does NOT create a stacking context, so those
pane z-indexes compete in the parent's stacking context and paint **above** app overlays with
smaller z-indexes (e.g. an onboarding screen at z-40). Symptom here: onboarding buttons were
visible but unclickable — `elementFromPoint` returned the Leaflet heatmap canvas.
**Fix:** give the map wrapper its own stacking context (`isolate` / `isolation:isolate`) so
Leaflet's z-indexes stay contained below the overlays. See `components/floodwatch/MapApp.tsx`.

## The in-app Browser pane freezes the animation/transition clock
Screenshots time out on a live Leaflet map (renderer never goes "idle"), AND CSS animations/
transitions are frozen at frame 0. This made bottom sheets appear off-screen (stuck at
`translateY(101%)`) and `transition-colors` chips show their pre-change color, which looked like
real bugs but were harness artifacts. **Verify via DOM + React-fiber/state inspection** (read
`memoizedState`, computed styles with transitions disabled) rather than screenshots. Programmatic
`.click()` also doesn't flush React synchronously in this harness — read state in a *separate*
tool call, not the same one.

## leaflet.heat crashes on a 0-size map container (IndexSizeError)
`L.heatLayer(...).addTo(map)` draws to a canvas sized from `map.getSize()`. If the map mounts before
its container is laid out (size 0×0), `getImageData` throws `IndexSizeError: source width is 0` and
takes down the whole React tree. This surfaced only after removing a hydration splash that had been
delaying the map mount. Fix: guard drawing behind a non-zero `map.getSize()` and retry on the map's
`resize` event / next frame. See `components/floodwatch/map/HeatLayer.tsx`. General rule: any
canvas/size-dependent Leaflet plugin must tolerate a not-yet-laid-out container.

## @upstash/redis with automaticDeserialization:false returns HGETALL as a flat array
We set `automaticDeserialization: false` (to control JSON ourselves for reports). A side effect:
`redis.hgetall(key)` then returns a **flat `[field, value, field, value, …]` array**, not an object.
Treating it as an object (`Object.entries`) silently yields index→value pairs and all parsing breaks
(tallies read as 0 despite HINCRBY working). Fix: the `hgetall` wrapper detects `Array.isArray` and
pairs up entries. See `lib/floodwatch/server/store.ts`. General rule: when you disable Upstash
auto-deserialization, re-check every command's return shape — several differ from the object form.

## Dev-only: a globalThis-cached instance goes stale when you add methods
The KV store is cached on `globalThis.__fwKV` so in-memory data survives HMR. Downside: after adding
a new method to the class (e.g. `incr`/`setEx`), the *cached instance* from before the edit lacks it,
so calls throw 500 until a **dev server restart**. Production is unaffected (fresh process). If a new
store method 500s in dev, restart before debugging further.

## Rate-limiting by IP: never trust the leftmost x-forwarded-for
`x-forwarded-for` is a client-writable header. Behind a trusted proxy (Vercel) the *real* client IP
is `x-real-ip` and/or the **rightmost** XFF entry (appended by the proxy); the **leftmost** entry is
whatever the client sent and is trivially spoofable. Taking `xff.split(",")[0]` for a per-IP cooldown
lets an attacker send a new fake IP per request and bypass it entirely. Fix: prefer `x-real-ip`, else
the rightmost XFF entry, length-capped. See `clientIp` in `lib/floodwatch/server/store.ts`. Caveat:
IP-based limiting is best-effort for a no-auth public app — real abuse resistance needs CAPTCHA/auth.

## Sanitize user text at the boundary even if it isn't rendered yet
Report `note` isn't displayed anywhere today, but storing it verbatim is a latent stored-XSS if it's
ever rendered via Leaflet `divIcon`/popup `innerHTML` (which bypasses React's escaping). Strip angle
brackets server-side on write as defense-in-depth.

## Next.js 16 map loading
`ssr:false` dynamic imports are only legal inside a Client Component. Leaflet touches `window`, so
it must be loaded via `dynamic(() => import('./FloodMap'), { ssr:false })` from a `'use client'`
wrapper. `viewport`/`themeColor` is a separate export from `metadata`.
