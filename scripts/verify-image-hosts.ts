// Evaluate the real Next image matcher/config locally. No fetch, upload or DB.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import config from "../next.config";
import { sourceModule } from "./source-module";

const directory = resolve(".next/cache/image-hosts-qa"); mkdirSync(directory, { recursive: true });
const baselineFile = resolve(directory, "next-before.ts");
writeFileSync(baselineFile, execFileSync("git", ["show", "550b4449c9f5632bf59cb0fde919bfe26fdf92c9:next.config.ts"], { encoding: "utf8" }));
const previous = sourceModule<{ default: NextConfig }>(baselineFile, {}).default;
const cloudinary = { protocol: "https", hostname: "res.cloudinary.com" };
assert.deepEqual(config, { ...previous, images: { ...previous.images, remotePatterns: [...(previous.images?.remotePatterns ?? []), cloudinary] } }, "Only the exact Cloudinary pattern may be added");
const patterns = config.images!.remotePatterns!;
const allowed = (url: string) => hasRemoteMatch(config.images?.domains ?? [], patterns, new URL(url));
assert.equal(allowed("https://res.cloudinary.com/w82zyjr9/image/upload/f_auto,q_auto/IMG_7882"), true);
assert.equal(allowed("https://images.unsplash.com/photo-fixture"), true);
assert.equal(allowed("https://qa-project.supabase.co/storage/v1/object/public/products/qa.webp"), true);
for (const url of [
  "http://res.cloudinary.com/qa/image/upload/qa.webp",
  "https://cloudinary.com/qa.webp",
  "https://other.cloudinary.com/qa.webp",
  "https://www.res.cloudinary.com/qa.webp",
  "https://res.cloudinary.com.evil.example/qa.webp",
  "https://example.invalid/qa.webp",
]) assert.equal(allowed(url), false, "Untrusted image host/protocol must remain rejected");
assert.ok(patterns.every((pattern) => pattern.hostname !== "**"));
assert.equal(patterns.filter((pattern) => pattern.hostname === "res.cloudinary.com").length, 1);
console.log("PASS Next image allowlist: representative Cloudinary upload URL accepted by installed Next matcher; existing Unsplash/Supabase preserved; HTTP/lookalikes/arbitrary hosts rejected; config differs from Production by one exact HTTPS Cloudinary entry only. No network/upload/DB.");
