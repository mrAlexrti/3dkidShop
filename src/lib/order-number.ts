import { randomBytes } from "node:crypto";

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function createOrderNumber(now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).replaceAll("-", "");
  // 32 divides 256: masking is unbiased, 10 characters carry 50 random bits.
  const suffix = [...randomBytes(10)].map((byte) => alphabet[byte & 31]).join("");
  return `3DK-${date}-${suffix}`;
}

export function isOrderNumberCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; meta?: { target?: unknown } };
  const target = candidate.meta?.target;
  return candidate.code === "P2002" && (Array.isArray(target) ? target.length === 1 && target[0] === "number" : target === "Order_number_key");
}
