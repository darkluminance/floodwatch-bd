import { Redis } from "@upstash/redis";
import { isInBangladesh, nearestRegion, REGIONS, roundCoord } from "../geo";
import type { Depth, Report, VoteKind } from "../types";

/**
 * Server-side report + vote store. Uses Upstash Redis (the successor to Vercel
 * KV) when credentials are present, and an in-memory fallback otherwise so local
 * dev runs with zero setup. Command usage is deliberately tiny: reports live in
 * a single Redis List, vote tallies in one hash, per-voter dedup in small keys.
 */

const REPORTS_KEY = "fw:reports";
const VOTES_KEY = "fw:votes"; // hash, fields `${region}:confirm|dispute`
const LOCATION_VOTES_KEY = "fw:lvotes"; // hash, fields `${cell}:confirm|dispute`
const cooldownKey = (ip: string) => `fw:cooldown:${ip}`;
const votedKey = (region: string, ip: string) => `fw:voted:${region}:${ip}`;
const reportVotedKey = (id: string, ip: string) => `fw:rvoted:${id}:${ip}`;
const locationVotedKey = (cell: string, ip: string) =>
  `fw:lvoted:${cell}:${ip}`;

/** A ~1.1km grid cell (2-decimal coords) used as the "spot" vote key. */
function locationCell(lat: number, lng: number): string {
  return `${(Math.round(lat * 100) / 100).toFixed(2)},${(
    Math.round(lng * 100) / 100
  ).toFixed(2)}`;
}

const COOLDOWN_SECONDS = 180;
const MAX_REPORTS = 500;
const WINDOW_MS = 3 * 24 * 3600 * 1000; // return last 3 days

const REGION_KEYS = new Set(REGIONS.map((r) => r.key));

export class CooldownError extends Error {
  constructor(public seconds: number) {
    super("cooldown");
  }
}
export class OutOfBoundsError extends Error {}
export class AlreadyVotedError extends Error {}
export class InvalidVoteError extends Error {}
export class ReportNotFoundError extends Error {}

/** Confirmations needed to mark a report verified; disputes to clear it. */
export const CONFIRM_THRESHOLD = 2;
// Higher than CONFIRM_THRESHOLD, and only acted on net-negative (see
// voteReport), so a report with real community support resists takedown by a
// small number of hostile/spoofed IPs.
export const DISPUTE_THRESHOLD = 3;

/** How long a per-voter dedup key needs to live: a vote past the report
 * retention window can never matter again, so tie the two together instead of
 * growing Redis forever. */
const VOTE_KEY_TTL_SECONDS = WINDOW_MS / 1000;

/**
 * Client IP for rate-limiting. Assumes a single trusted reverse proxy
 * (e.g. Vercel) that sets `x-real-ip` to the real client IP and appends it as
 * the *rightmost* `x-forwarded-for` entry. The leftmost XFF entry is
 * client-supplied and spoofable, so we never trust it. Length-capped to avoid
 * oversized Redis keys.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim().slice(0, 64);
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  // No proxy header at all. In dev (no Vercel in front) that's expected, so
  // share one "local" identity for a smooth single-machine experience. In
  // production it means the deploy's reverse proxy isn't set up as assumed —
  // fail closed with a random per-request identity rather than silently
  // collapsing every visitor onto one shared cooldown/vote bucket, which
  // would let any anonymous request rate-limit the entire site.
  if (process.env.NODE_ENV === "production") return crypto.randomUUID();
  return "local";
}

/**
 * Reject cross-site POSTs so another site can't submit reports/votes that get
 * attributed to a victim's IP. `Sec-Fetch-Site` (sent by all modern browsers)
 * is the primary signal; `Origin` is the fallback for the rare client that
 * omits it. Requests with neither header (e.g. non-browser API clients) are
 * allowed through, same as before this check existed.
 */
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return (
      fetchSite === "same-origin" ||
      fetchSite === "same-site" ||
      fetchSite === "none"
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// ---- Minimal KV interface implemented by both backends ----
interface KV {
  rpush(key: string, ...vals: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lset(key: string, index: number, val: string): Promise<unknown>;
  lrem(key: string, count: number, val: string): Promise<number>;
  getStr(key: string): Promise<string | null>;
  /** MGET across multiple keys, preserving order (null for misses). */
  mget(keys: string[]): Promise<(string | null)[]>;
  /** SET key 1 NX EX <seconds>. Returns true if newly set (not on cooldown). */
  setNxEx(key: string, seconds: number): Promise<boolean>;
  /** SET key <val> NX [EX <seconds>]. Returns true if newly set. */
  setNxVal(key: string, val: string, ttlSeconds?: number): Promise<boolean>;
  /** SET key <val> EX <seconds> (plain cache write). */
  setEx(key: string, val: string, seconds: number): Promise<void>;
  /** INCR key, setting EX <seconds> on first increment. Returns new count. */
  incr(key: string, seconds: number): Promise<number>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
}

class RedisKV implements KV {
  constructor(private r: Redis) {}
  rpush(key: string, ...vals: string[]) {
    return this.r.rpush(key, ...vals);
  }
  lrange(key: string, start: number, stop: number) {
    return this.r.lrange(key, start, stop) as Promise<string[]>;
  }
  ltrim(key: string, start: number, stop: number) {
    return this.r.ltrim(key, start, stop);
  }
  lset(key: string, index: number, val: string) {
    return this.r.lset(key, index, val);
  }
  lrem(key: string, count: number, val: string) {
    return this.r.lrem(key, count, val);
  }
  async getStr(key: string) {
    return (await this.r.get(key)) as string | null;
  }
  async mget(keys: string[]) {
    if (keys.length === 0) return [];
    return (await this.r.mget(...keys)) as (string | null)[];
  }
  async setNxEx(key: string, seconds: number) {
    const res = await this.r.set(key, "1", { nx: true, ex: seconds });
    return res === "OK";
  }
  async setNxVal(key: string, val: string, ttlSeconds?: number) {
    const res = await this.r.set(
      key,
      val,
      ttlSeconds ? { nx: true, ex: ttlSeconds } : { nx: true },
    );
    return res === "OK";
  }
  async setEx(key: string, val: string, seconds: number) {
    await this.r.set(key, val, { ex: seconds });
  }
  async incr(key: string, seconds: number) {
    const n = await this.r.incr(key);
    if (n === 1) await this.r.expire(key, seconds);
    return n;
  }
  hincrby(key: string, field: string, by: number) {
    return this.r.hincrby(key, field, by);
  }
  async hget(key: string, field: string) {
    return (await this.r.hget(key, field)) as string | null;
  }
  async hgetall(key: string) {
    // With automaticDeserialization disabled, Upstash may return HGETALL as a
    // flat [field, value, ...] array rather than an object. Handle both.
    const res = (await this.r.hgetall(key)) as
      | Record<string, unknown>
      | unknown[]
      | null;
    const out: Record<string, string> = {};
    if (!res) return out;
    if (Array.isArray(res)) {
      for (let i = 0; i + 1 < res.length; i += 2) {
        out[String(res[i])] = String(res[i + 1]);
      }
    } else {
      for (const [k, v] of Object.entries(res)) out[k] = String(v);
    }
    return out;
  }
}

/** Redis-compatible LRANGE/LTRIM slice with negative-index + inclusive stop. */
function redisSlice(arr: string[], start: number, stop: number): string[] {
  const len = arr.length;
  const s = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
  if (e < 0 || s > e) return [];
  return arr.slice(s, e + 1);
}

class MemoryKV implements KV {
  private lists = new Map<string, string[]>();
  private scalars = new Map<string, { v: string; exp: number }>();
  private hashes = new Map<string, Map<string, number>>();
  private counters = new Map<string, { n: number; exp: number }>();

  rpush(key: string, ...vals: string[]) {
    const l = this.lists.get(key) ?? [];
    l.push(...vals);
    this.lists.set(key, l);
    return Promise.resolve(l.length);
  }
  lrange(key: string, start: number, stop: number) {
    return Promise.resolve(redisSlice(this.lists.get(key) ?? [], start, stop));
  }
  ltrim(key: string, start: number, stop: number) {
    this.lists.set(key, redisSlice(this.lists.get(key) ?? [], start, stop));
    return Promise.resolve("OK");
  }
  lset(key: string, index: number, val: string) {
    const l = this.lists.get(key);
    if (l && index >= 0 && index < l.length) l[index] = val;
    return Promise.resolve("OK");
  }
  lrem(key: string, count: number, val: string) {
    const l = this.lists.get(key);
    if (!l) return Promise.resolve(0);
    const kept = l.filter((v) => v !== val);
    const removed = l.length - kept.length;
    this.lists.set(key, kept);
    return Promise.resolve(removed);
  }
  getStr(key: string) {
    const c = this.scalars.get(key);
    if (!c || c.exp <= Date.now()) return Promise.resolve(null);
    return Promise.resolve(c.v);
  }
  mget(keys: string[]) {
    return Promise.all(keys.map((k) => this.getStr(k)));
  }
  private trySet(key: string, val: string, exp: number): boolean {
    const cur = this.scalars.get(key);
    if (cur && cur.exp > Date.now()) return false;
    this.scalars.set(key, { v: val, exp });
    return true;
  }
  setNxEx(key: string, seconds: number) {
    return Promise.resolve(this.trySet(key, "1", Date.now() + seconds * 1000));
  }
  setNxVal(key: string, val: string, ttlSeconds?: number) {
    const exp = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    return Promise.resolve(this.trySet(key, val, exp));
  }
  setEx(key: string, val: string, seconds: number) {
    this.scalars.set(key, { v: val, exp: Date.now() + seconds * 1000 });
    return Promise.resolve();
  }
  incr(key: string, seconds: number) {
    const now = Date.now();
    const c = this.counters.get(key);
    if (!c || c.exp <= now) {
      this.counters.set(key, { n: 1, exp: now + seconds * 1000 });
      return Promise.resolve(1);
    }
    c.n += 1;
    return Promise.resolve(c.n);
  }
  hincrby(key: string, field: string, by: number) {
    const h = this.hashes.get(key) ?? new Map<string, number>();
    const next = (h.get(field) ?? 0) + by;
    h.set(field, next);
    this.hashes.set(key, h);
    return Promise.resolve(next);
  }
  hget(key: string, field: string) {
    const v = this.hashes.get(key)?.get(field);
    return Promise.resolve(v === undefined ? null : String(v));
  }
  hgetall(key: string) {
    const h = this.hashes.get(key);
    const out: Record<string, string> = {};
    if (h) for (const [k, v] of h) out[k] = String(v);
    return Promise.resolve(out);
  }
}

// Singleton — the in-memory fallback is stashed on globalThis so it survives
// dev HMR module reloads (keeping data shared across requests locally).
const globalForKV = globalThis as unknown as {
  __fwKV?: KV;
  __fwKVWarned?: boolean;
};

function getKV(): KV {
  if (globalForKV.__fwKV) return globalForKV.__fwKV;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    globalForKV.__fwKV = new RedisKV(
      new Redis({ url, token, automaticDeserialization: false }),
    );
  } else if (process.env.NODE_ENV === "production") {
    // The in-memory fallback silently loses data on every cold start and
    // splits state across serverless instances — acceptable for local dev,
    // never for a live deploy. Fail loudly instead of shipping broken.
    throw new Error(
      "[floodwatch] KV_REST_API_URL/KV_REST_API_TOKEN are required in production " +
        "(the in-memory store is dev-only and does not persist or share state).",
    );
  } else {
    if (!globalForKV.__fwKVWarned) {
      console.warn(
        "[floodwatch] KV_REST_API_URL/KV_REST_API_TOKEN not set — using in-memory store. " +
          "Data is shared across tabs on this dev server only, not across deployments. " +
          "Add Upstash credentials to .env.local for a real shared database.",
      );
      globalForKV.__fwKVWarned = true;
    }
    globalForKV.__fwKV = new MemoryKV();
  }
  return globalForKV.__fwKV;
}

function parseReport(raw: string): Report | null {
  try {
    return JSON.parse(raw) as Report;
  } catch {
    return null;
  }
}

/** All reports from the last 3 days, oldest first. */
export async function listReports(): Promise<Report[]> {
  const kv = getKV();
  const raw = await kv.lrange(REPORTS_KEY, 0, -1);
  const cutoff = Date.now() - WINDOW_MS;
  return raw
    .map(parseReport)
    .filter((r): r is Report => !!r && r.createdAt >= cutoff && !r.hidden);
}

const DEPTHS: Depth[] = ["Ankle", "Knee", "Waist", "Above"];

/** Validate + rate-limit + persist a new report. Throws on cooldown/bounds. */
export async function addReport(
  input: { lat: number; lng: number; depth: unknown; note: unknown },
  ip: string,
): Promise<Report> {
  const rawLat = Number(input.lat);
  const rawLng = Number(input.lng);
  if (
    !Number.isFinite(rawLat) ||
    !Number.isFinite(rawLng) ||
    !isInBangladesh(rawLat, rawLng)
  ) {
    throw new OutOfBoundsError();
  }
  // Round to ~100m *after* bounds validation, before persisting — the exact
  // device location (often a reporter's home, from the "auto" geolocation
  // flow) is never written to the shared, publicly-readable store.
  const lat = roundCoord(rawLat);
  const lng = roundCoord(rawLng);

  const kv = getKV();
  const allowed = await kv.setNxEx(cooldownKey(ip), COOLDOWN_SECONDS);
  if (!allowed) throw new CooldownError(COOLDOWN_SECONDS);

  const depth =
    typeof input.depth === "string" && DEPTHS.includes(input.depth as Depth)
      ? (input.depth as Depth)
      : null;
  // Strip angle brackets so a note can never carry HTML/script markup, even if
  // it is ever rendered somewhere down the line (defense-in-depth).
  const note =
    typeof input.note === "string"
      ? input.note.replace(/[<>]/g, "").trim().slice(0, 200)
      : "";

  const now = Date.now();
  const report: Report = {
    id: `r-${now}-${Math.random().toString(36).slice(2, 8)}`,
    lat,
    lng,
    depth,
    note,
    verified: false,
    createdAt: now,
    votes: { confirm: 0, dispute: 0 },
    region: nearestRegion(lat, lng)?.key,
  };

  await kv.rpush(REPORTS_KEY, JSON.stringify(report));
  await kv.ltrim(REPORTS_KEY, -MAX_REPORTS, -1);
  return report;
}

export interface RegionTally {
  confirm: number;
  dispute: number;
}

/** Shared vote tallies per region + this viewer's own vote per region. */
export async function getVotes(ip: string): Promise<{
  tallies: Record<string, RegionTally>;
  mine: Record<string, VoteKind>;
}> {
  const kv = getKV();
  const tallies: Record<string, RegionTally> = {};
  for (const region of REGIONS) tallies[region.key] = { confirm: 0, dispute: 0 };

  const raw = await kv.hgetall(VOTES_KEY);
  for (const [field, val] of Object.entries(raw)) {
    const [region, kind] = field.split(":");
    if (tallies[region] && (kind === "confirm" || kind === "dispute")) {
      tallies[region][kind] = Number(val) || 0;
    }
  }

  const mine: Record<string, VoteKind> = {};
  const votedVals = await kv.mget(REGIONS.map((r) => votedKey(r.key, ip)));
  REGIONS.forEach((region, i) => {
    const v = votedVals[i];
    if (v === "confirmed" || v === "disputed") mine[region.key] = v;
  });
  return { tallies, mine };
}

/** Record one vote per device/IP per region. Throws if already voted. */
export async function castVote(
  region: string,
  kind: VoteKind,
  ip: string,
): Promise<void> {
  if (
    !REGION_KEYS.has(region) ||
    (kind !== "confirmed" && kind !== "disputed")
  ) {
    throw new InvalidVoteError();
  }
  const kv = getKV();
  const first = await kv.setNxVal(
    votedKey(region, ip),
    kind,
    VOTE_KEY_TTL_SECONDS,
  );
  if (!first) throw new AlreadyVotedError();
  const field = `${region}:${kind === "confirmed" ? "confirm" : "dispute"}`;
  await kv.hincrby(VOTES_KEY, field, 1);
}

export interface LocationTally {
  confirm: number;
  dispute: number;
  mine: VoteKind | null;
}

/** This viewer's vote + shared tally for the ~1km cell around a coordinate. */
export async function getLocationVote(
  lat: number,
  lng: number,
  ip: string,
): Promise<LocationTally> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { confirm: 0, dispute: 0, mine: null };
  }
  const kv = getKV();
  const cell = locationCell(lat, lng);
  const [confirm, dispute, mineRaw] = await Promise.all([
    kv.hget(LOCATION_VOTES_KEY, `${cell}:confirm`),
    kv.hget(LOCATION_VOTES_KEY, `${cell}:dispute`),
    kv.getStr(locationVotedKey(cell, ip)),
  ]);
  const mine = mineRaw === "confirmed" || mineRaw === "disputed" ? mineRaw : null;
  return { confirm: Number(confirm) || 0, dispute: Number(dispute) || 0, mine };
}

/**
 * Confirm/dispute a "spot" (~1km cell). One vote per device/IP per cell. This
 * is an aggregate community signal, deliberately independent of individual
 * reports' verified/hidden state.
 */
export async function castLocationVote(
  lat: number,
  lng: number,
  kind: VoteKind,
  ip: string,
): Promise<void> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !isInBangladesh(lat, lng) ||
    (kind !== "confirmed" && kind !== "disputed")
  ) {
    throw new InvalidVoteError();
  }
  const kv = getKV();
  const cell = locationCell(lat, lng);
  const first = await kv.setNxVal(
    locationVotedKey(cell, ip),
    kind,
    VOTE_KEY_TTL_SECONDS,
  );
  if (!first) throw new AlreadyVotedError();
  const field = `${cell}:${kind === "confirmed" ? "confirm" : "dispute"}`;
  await kv.hincrby(LOCATION_VOTES_KEY, field, 1);
}

export interface ReportVoteResult {
  report: Report;
  verified: boolean;
  removed: boolean;
}

/**
 * Confirm/dispute a single report. One vote per device/IP per report. Enough
 * confirmations mark it verified; enough disputes clear (remove) it.
 */
export async function voteReport(
  reportId: string,
  kind: VoteKind,
  ip: string,
): Promise<ReportVoteResult> {
  if (
    typeof reportId !== "string" ||
    !reportId ||
    reportId.length > 64 ||
    (kind !== "confirmed" && kind !== "disputed")
  ) {
    throw new InvalidVoteError();
  }
  const kv = getKV();

  const raw = await kv.lrange(REPORTS_KEY, 0, -1);
  let index = -1;
  let report: Report | null = null;
  for (let i = 0; i < raw.length; i++) {
    const r = parseReport(raw[i]);
    if (r && r.id === reportId) {
      index = i;
      report = r;
      break;
    }
  }
  // Already-hidden reports are off the map — treat like they don't exist.
  if (!report || report.hidden) throw new ReportNotFoundError();

  // Dedup only after we know the report exists.
  const first = await kv.setNxVal(
    reportVotedKey(reportId, ip),
    kind,
    VOTE_KEY_TTL_SECONDS,
  );
  if (!first) throw new AlreadyVotedError();

  if (kind === "confirmed") report.votes.confirm += 1;
  else report.votes.dispute += 1;

  // Soft-delete (hide, don't erase) once disputes clearly outweigh
  // confirmations — a report with real community support resists takedown
  // by a small number of hostile or spoofed IPs, and hiding (vs. `lrem`)
  // keeps the data recoverable instead of silently destroying it.
  if (
    report.votes.dispute >= DISPUTE_THRESHOLD &&
    report.votes.dispute > report.votes.confirm
  ) {
    report.hidden = true;
    await kv.lset(REPORTS_KEY, index, JSON.stringify(report));
    return { report, verified: false, removed: true };
  }

  if (report.votes.confirm >= CONFIRM_THRESHOLD) report.verified = true;
  await kv.lset(REPORTS_KEY, index, JSON.stringify(report));
  return { report, verified: report.verified, removed: false };
}

// ---- geocode response cache + per-IP rate limit ----
const GEOCODE_RATE_LIMIT = 30; // requests per minute per IP

export async function geocodeCacheGet(key: string): Promise<string | null> {
  return getKV().getStr(`fw:geo:${key}`);
}
export async function geocodeCacheSet(
  key: string,
  val: string,
  ttlSeconds: number,
): Promise<void> {
  return getKV().setEx(`fw:geo:${key}`, val, ttlSeconds);
}
/** True while the IP is under the per-minute geocode budget. */
export async function geocodeRateOk(ip: string): Promise<boolean> {
  const n = await getKV().incr(`fw:georate:${ip}`, 60);
  return n <= GEOCODE_RATE_LIMIT;
}

export { COOLDOWN_SECONDS };
