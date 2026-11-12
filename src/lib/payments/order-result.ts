import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/server-env";

const lifetime = 24 * 60 * 60 * 1000;
function signature(number: string, issued: string) {
  const secret = getAuthSecret();
  if (!secret) throw new Error("ORDER_RESULT_SECRET_MISSING");
  return createHmac("sha256", secret).update(`order-result:v1:${number}:${issued}`).digest("hex");
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
