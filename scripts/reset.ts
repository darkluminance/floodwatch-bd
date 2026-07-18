/**
 * Reset the FloodWatch shared store: deletes every `fw:*` key (reports, vote
 * tallies, per-IP votes, cooldowns, geocode cache). Leaves the map empty until
 * real users submit reports.
 *
 * Usage (Bun auto-loads .env):
 *   bun run reset          # dry run — lists what would be deleted
 *   bun run reset --yes    # actually delete
 */
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.log(
    "No Upstash credentials found (KV_REST_API_URL / KV_REST_API_TOKEN).\n" +
      "The in-memory dev store resets on its own when you restart `bun run dev`.",
  );
  process.exit(0);
}

const confirmed =
  process.argv.includes("--yes") || process.argv.includes("-y");

const redis = new Redis({ url, token });
const keys = await redis.keys("fw:*");

if (keys.length === 0) {
  console.log("Nothing to reset — no fw:* keys found.");
  process.exit(0);
}

if (!confirmed) {
  console.log(`Dry run — would delete ${keys.length} key(s):`);
  for (const k of keys) console.log("  " + k);
  console.log("\nRe-run with --yes to actually reset:  bun run reset --yes");
  process.exit(0);
}

await redis.del(...keys);
console.log(`Reset complete — deleted ${keys.length} key(s).`);
console.log("The map is now empty; it fills as real users submit reports.");
