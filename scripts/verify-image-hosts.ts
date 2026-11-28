// Evaluate the real Next image matcher/config locally. No fetch, upload or DB.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import config from "../next.config.mjs";
import { sourceModule } from "./source-module";

const directory = resolve(".next/cache/image-hosts-qa"); mkdirSync(directory, { recursive: true });
const baselineFile = resolve(directory, "next-before.ts");
writeFileSync(baselineFile, execFileSync("git", ["show", "8cd280af5c678d5e7bd38223718aeb9918cfae9c:next.config.ts"], { encoding: "utf8" }));
const previous = sourceModule<{ default: NextConfig }>(baselineFile, {}).default;
const { headers: currentHeaders, ...currentSettings } = config;
const { headers: previousHeaders, ...previousSettings } = previous;
assert.deepEqual(currentSettings, previousSettings, "Next configuration must retain the deployed BRAND-01B settings");
const patterns = config.images!.remotePatterns!;
const allowed = (url: string) => hasRemoteMatch(config.images?.domains ?? [], patterns, new URL(url));
assert.equal(allowed("https://res.cloudinary.com/w82zyjr9/image/upload/f_auto,q_auto/IMG_7882"), true);
assert.equal(allowed("https://images.unsplash.com/photo-fixture"), true);
assert.equal(allowed("https://store123.public.blob.vercel-storage.com/3dkid/product-media/image/a.webp"), true);
assert.equal(allowed("https://qa-project.supabase.co/storage/v1/object/public/products/qa.webp"), true);
for (const url of [
  "http://res.cloudinary.com/qa/image/upload/qa.webp",
  "https://cloudinary.com/qa.webp",
  "https://other.cloudinary.com/qa.webp",
  "https://www.res.cloudinary.com/qa.webp",
  "https://res.cloudinary.com.evil.example/qa.webp",
  "https://example.invalid/qa.webp",
  "https://store123.private.blob.vercel-storage.com/a.webp",
  "http://store123.public.blob.vercel-storage.com/a.webp",
  "https://store123.public.blob.vercel-storage.com.evil.invalid/a.webp",
]) assert.equal(allowed(url), false, "Untrusted image host/protocol must remain rejected");
assert.ok(patterns.every((pattern) => pattern.hostname !== "**"));
assert.equal(patterns.filter((pattern) => pattern.hostname === "res.cloudinary.com").length, 1);
void Promise.all([currentHeaders?.(), previousHeaders?.()]).then(([current, baseline]) => {
  assert.deepEqual(current, baseline, "Deployed response headers must be preserved");
  console.log("PASS deployed Next configuration and headers, with existing allowed and rejected image hosts. No network/upload/DB.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
