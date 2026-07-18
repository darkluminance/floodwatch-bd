import { Redis } from "@upstash/redis";
import { isInBangladesh, nearestRegion, REGIONS } from "../geo";
import type { Depth, Report, VoteKind } from "../types";

/**
 * Server-side report + vote store. Uses Upstash Redis (the successor to Vercel
 * KV) when credentials are present, and an in-memory fallback otherwise so local
 * dev runs with zero setup. Command usage is deliberately tiny: reports live in
 * a single Redis List, vote tallies in one hash, per-voter dedup in small keys.
 */

const REPORTS_KEY = "fw:reports";
const VOTES_KEY = "fw:votes"; // hash, fields `${region}:confirm|dispute`
const cooldownKey = (ip: string) => `fw:cooldown:${ip}`;
const votedKey = (region: string, ip: string) => `fw:voted:${region}:${ip}`;
const reportVotedKey = (id: string, ip: string) => `fw:rvoted:${id}:${ip}`;

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
export const DISPUTE_THRESHOLD = 2;

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
  return "local";
}

// ---- Minimal KV interface implemented by both backends ----
interface KV {
  rpush(key: string, ...vals: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lset(key: string, index: number, val: string): Promise<unknown>;
  lrem(key: string, count: number, val: string): Promise<number>;
  getStr(key: string): Promise<string | null>;
  /** SET key 1 NX EX <seconds>. Returns true if newly set (not on cooldown). */
  setNxEx(key: string, seconds: number): Promise<boolean>;
  /** SET key <val> NX. Returns true if newly set. */
  setNxVal(key: string, val: string): Promise<boolean>;
  /** SET key <val> EX <seconds> (plain cache write). */
  setEx(key: string, val: string, seconds: number): Promise<void>;
  /** INCR key, setting EX <seconds> on first increment. Returns new count. */
  incr(key: string, seconds: number): Promise<number>;
  hincrby(key: string, field: string, by: number): Promise<number>;
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
  async setNxEx(key: string, seconds: number) {
    const res = await this.r.set(key, "1", { nx: true, ex: seconds });
    return res === "OK";
  }
  async setNxVal(key: string, val: string) {
    const res = await this.r.set(key, val, { nx: true });
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
  private trySet(key: string, val: string, exp: number): boolean {
    const cur = this.scalars.get(key);
    if (cur && cur.exp > Date.now()) return false;
    this.scalars.set(key, { v: val, exp });
    return true;
  }
  setNxEx(key: string, seconds: number) {
    return Promise.resolve(this.trySet(key, "1", Date.now() + seconds * 1000));
  }
  setNxVal(key: string, val: string) {
    return Promise.resolve(this.trySet(key, val, Infinity));
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
    .filter((r): r is Report => !!r && r.createdAt >= cutoff);
}

const DEPTHS: Depth[] = ["Ankle", "Knee", "Waist", "Above"];

/** Validate + rate-limit + persist a new report. Throws on cooldown/bounds. */
export async function addReport(
  input: { lat: number; lng: number; depth: unknown; note: unknown },
  ip: string,
): Promise<Report> {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInBangladesh(lat, lng)) {
    throw new OutOfBoundsError();
  }

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
  for (const region of REGIONS) {
    const v = await kv.getStr(votedKey(region.key, ip));
    if (v === "confirmed" || v === "disputed") mine[region.key] = v;
  }
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
  const first = await kv.setNxVal(votedKey(region, ip), kind);
  if (!first) throw new AlreadyVotedError();
  const field = `${region}:${kind === "confirmed" ? "confirm" : "dispute"}`;
  await kv.hincrby(VOTES_KEY, field, 1);
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
  let rawEntry = "";
  let report: Report | null = null;
  for (let i = 0; i < raw.length; i++) {
    const r = parseReport(raw[i]);
    if (r && r.id === reportId) {
      index = i;
      rawEntry = raw[i];
      report = r;
      break;
    }
  }
  if (!report) throw new ReportNotFoundError();

  // Dedup only after we know the report exists.
  const first = await kv.setNxVal(reportVotedKey(reportId, ip), kind);
  if (!first) throw new AlreadyVotedError();

  if (kind === "confirmed") report.votes.confirm += 1;
  else report.votes.dispute += 1;

  if (report.votes.dispute >= DISPUTE_THRESHOLD) {
    await kv.lrem(REPORTS_KEY, 1, rawEntry);
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
