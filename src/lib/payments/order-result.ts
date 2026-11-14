import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/server-env";

const lifetime = 24 * 60 * 60 * 1000;
function signature(number: string, issued: string, domain = "order-result:v1") {
  const secret = getAuthSecret();
  if (!secret) throw new Error("ORDER_RESULT_SECRET_MISSING");
  return createHmac("sha256", secret).update(`${domain}:${number}:${issued}`).digest("hex");
}

export function createAttemptResultToken(reference: string, now = Date.now()) {
  return `${now}.${signature(reference, String(now), "payment-attempt:v2")}`;
}
export function validAttemptResultToken(reference: string, token: string, now = Date.now()) {
  if (!/^pay_[a-f0-9]{32}$/.test(reference) || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const [issued, received] = token.split(".");
  if (now - Number(issued) > lifetime || Number(issued) > now + 60000) return false;
  try { return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(signature(reference, issued, "payment-attempt:v2"), "hex")); }
  catch { return false; }
}
export function getAttemptResultPath(reference: string) {
  return `/checkout/success?${new URLSearchParams({ attempt: reference, token: createAttemptResultToken(reference) })}`;
}

// A short-lived capability grants status-only access, never customer/order details.
export function createOrderResultToken(number: string, now = Date.now()) {
  return `${now}.${signature(number, String(now))}`;
}
export function validOrderResultToken(number: string, token: string, now = Date.now()) {
  if (!/^[\w-]{1,100}$/.test(number) || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const [issued, received] = token.split(".");
  if (now - Number(issued) > lifetime || Number(issued) > now + 60000) return false;
  try { return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(signature(number, issued), "hex")); }
  catch { return false; }
}
export function getOrderResultPath(number: string) {
  return `/checkout/success?${new URLSearchParams({ order: number, token: createOrderResultToken(number) })}`;
}
