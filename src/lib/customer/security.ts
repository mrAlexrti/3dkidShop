import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readServerEnv } from "@/lib/server-env";

export const sessionSeconds = 60 * 60 * 24 * 14;
export const customerSecret = () => readServerEnv("CUSTOMER_AUTH_SECRET");
export const emailInput = z.string().trim().max(254).email().toLowerCase();
export const passwordInput = z.string().min(12).refine(passwordFits);
export const tokenInput = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export function customerOrigin() {
  try {
    const url = new URL(readServerEnv("CUSTOMER_AUTH_ORIGIN"));
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && process.env.VERCEL_ENV !== "production")) return url.origin;
  } catch { /* Configuration is optional until customer access is enabled. */ }
  return "";
}

export function customerEnabled() {
  return Boolean(customerOrigin() && customerSecret().length >= 32);
}

export function googleEnabled() {
  return customerEnabled() && Boolean(readServerEnv("CUSTOMER_GOOGLE_CLIENT_ID") && readServerEnv("CUSTOMER_GOOGLE_CLIENT_SECRET"));
}

export function customerCookie(name: string) {
  return {
    name: `${customerOrigin().startsWith("https:") ? "__Host-" : ""}3dkid.customer.${name}`,
    options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: customerOrigin().startsWith("https:") },
  };
}

export async function customerPost() {
  if (!customerEnabled()) return false;
  const origin = new URL(customerOrigin());
  const request = await headers();
  return request.get("origin") === origin.origin && request.get("host") === origin.host;
}

export function passwordFits(password: string) {
  return password.length <= 72 && Buffer.byteLength(password) <= 72 && !password.includes("\0");
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

// Compare against an equally expensive hash when no usable credential exists.
const dummyHash = "$2a$12$Qx7RRFSGn4Hp/ZFT8eu69.oTnCVPtXTmfZOOjA.MeBkMMFTe7BRP6";
export async function passwordMatches(password: string, hash?: string | null) {
  if (!passwordFits(password)) return false;
  const matches = await bcrypt.compare(password, hash || dummyHash);
  return !!hash && matches;
}

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

const hour = 60 * 60 * 1000;
export async function rateLimit(action: string, subject?: string, subjectLimit = 6) {
  const requestHeaders = await headers();
  // Vercel sets x-vercel-forwarded-for and overwrites a client-supplied value.
  const candidate = process.env.VERCEL === "1" ? requestHeaders.get("x-vercel-forwarded-for")?.trim() : "";
  const ip = candidate && isIP(candidate) ? candidate : "";
  const now = Date.now();
  const bucket = Math.floor(now / hour);
  const end = new Date((bucket + 1) * hour);
  const limits: [string, number][] = [
    [ip ? `ip:${ip}` : "shared", ip ? 40 : 180],
    ["global", 600],
  ];
  if (subject) limits.push([`subject:${subject}`, subjectLimit]);
  const buckets = limits.map(([scope, limit]) => {
    const key = createHmac("sha256", customerSecret()).update(JSON.stringify([action, scope, bucket])).digest("hex");
    return Prisma.sql`(${key}::text, ${limit}::int)`;
  });
  const [result] = await prisma.$queryRaw<{ admitted: number }[]>(Prisma.sql`
    WITH limits(key, ceiling) AS (VALUES ${Prisma.join(buckets)}), counted AS (
      INSERT INTO public."CustomerRateLimit" (key, expires, hits)
      SELECT key, ${end}, 1 FROM limits ORDER BY key
      ON CONFLICT (key) DO UPDATE SET hits = "CustomerRateLimit".hits + 1
      WHERE "CustomerRateLimit".hits < (SELECT ceiling FROM limits WHERE limits.key = excluded.key)
      RETURNING key
    ) SELECT count(*)::int AS admitted FROM counted`);
  return result.admitted === limits.length;
}
