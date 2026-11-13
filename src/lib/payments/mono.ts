import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { readServerEnv } from "@/lib/server-env";
import { formatOrderReference } from "@/lib/order-reference";

const API = "https://api.monobank.ua";
export const MONO_VALIDITY_SECONDS = 3600;
export const MONO_TIMEOUT_MS = 15000;
export type HostedCheckout = { provider: "mono"; pageUrl: string };
export type MonoSnapshot = {
  invoiceId: string; reference: string; status: string; amount: number; ccy: number;
  modifiedDate: string; createdDate?: string; finalAmount?: number; errCode?: string;
  cancelList?: { status: string; amount: number; ccy: number }[];
};

type MonoEndpoint = "invoice/create" | "invoice/status" | "invoice/remove" | "pubkey" | "local";
type MonoCategory = "configuration" | "local_validation" | "http_rejection" | "provider_uncertain" | "transport" | "timeout" | "invalid_response" | "attachment";
export class MonoError extends Error {
  readonly category: MonoCategory;
  readonly endpoint: MonoEndpoint;
  readonly httpStatus: number | null;
  readonly invoiceId?: string;
  constructor(public readonly code: "MONO_UNAVAILABLE" | "MONO_INVALID_RESPONSE" | "MONO_NOT_CONFIGURED" | "MONO_HTTP_REJECTED" | "MONO_INVALID_INPUT", details: {
    category?: MonoCategory; endpoint?: MonoEndpoint; httpStatus?: number; invoiceId?: string;
  } = {}) {
    super(code);
    this.category = details.category ?? (code === "MONO_NOT_CONFIGURED" ? "configuration" : code === "MONO_INVALID_RESPONSE" ? "invalid_response" : "transport");
    this.endpoint = details.endpoint ?? "local"; this.httpStatus = details.httpStatus ?? null;
    this.invoiceId = details.invoiceId;
  }
  get definiteRejection() { return ["configuration", "local_validation", "http_rejection"].includes(this.category); }
}
export function logMonoInitializationError(error: unknown, orderNumber?: string) {
  const safe = error instanceof MonoError ? error : new MonoError("MONO_UNAVAILABLE", { category: "attachment", endpoint: "invoice/create" });
  console.warn("Mono initialization", { endpoint: safe.endpoint, category: safe.category, httpStatus: safe.httpStatus, ...(orderNumber ? { orderNumber } : {}) });
}

export function monoSiteOrigin(): string | null {
  try {
    const url = new URL(readServerEnv("SITE_URL") || readServerEnv("NEXT_PUBLIC_SITE_URL"));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

export function validInvoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export function validHostedPage(value: unknown, invoiceId: string): value is string {
  try {
    if (typeof value !== "string") return false;
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pay.mbnk.biz" && !url.port && !url.username && !url.password &&
      url.pathname === `/${invoiceId}` && !url.search && !url.hash;
  } catch { return false; }
}

async function api(path: string, body?: unknown, empty = false): Promise<unknown> {
  const endpoint: MonoEndpoint = path.includes("invoice/create") ? "invoice/create" : path.includes("invoice/status") ? "invoice/status" : path.includes("invoice/remove") ? "invoice/remove" : "pubkey";
  const token = readServerEnv("MONO_ACQUIRING_TOKEN");
  if (!token) throw new MonoError("MONO_NOT_CONFIGURED", { endpoint });
  try {
    const response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(MONO_TIMEOUT_MS),
    });
    if (!response.ok) throw new MonoError([400, 403, 404, 405, 429].includes(response.status) ? "MONO_HTTP_REJECTED" : "MONO_UNAVAILABLE", {
      endpoint, category: [400, 403, 404, 405, 429].includes(response.status) ? "http_rejection" : "provider_uncertain", httpStatus: response.status,
    });
    if (response.status !== 200) throw new MonoError("MONO_INVALID_RESPONSE", { endpoint, category: "invalid_response", httpStatus: response.status });
    if (empty) return undefined; // remove returns an empty successful response.
    try { return await response.json(); }
    catch { throw new MonoError("MONO_INVALID_RESPONSE", { endpoint, category: "invalid_response", httpStatus: response.status }); }
  } catch (error) {
    if (error instanceof MonoError) throw error;
    // Never propagate upstream response bodies, headers or credential-bearing errors.
    throw new MonoError("MONO_UNAVAILABLE", { endpoint, category: error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "transport" });
  }
}

export async function createMonoInvoice(input: { number: string; amount: number; email: string; resultPath: string }) {
  const origin = monoSiteOrigin();
  if (!origin) throw new MonoError("MONO_NOT_CONFIGURED", { endpoint: "invoice/create" });
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 9999999999 ||
      !/^[\w-]{1,100}$/.test(input.number) || !input.resultPath.startsWith("/checkout/success?")) throw new MonoError("MONO_INVALID_INPUT", { category: "local_validation", endpoint: "invoice/create" });
  const value = await api("/api/merchant/invoice/create", {
    amount: input.amount, ccy: 980,
    merchantPaymInfo: { reference: input.number, destination: `3D Kid — ${formatOrderReference(input.number)}`, ...(input.email ? { customerEmails: [input.email] } : {}) },
    redirectUrl: `${origin}${input.resultPath}`, webHookUrl: `${origin}/api/payments/mono/webhook`,
    validity: MONO_VALIDITY_SECONDS, paymentType: "debit",
  }) as { invoiceId?: unknown; pageUrl?: unknown } | null;
  if (!value || !validInvoiceId(value.invoiceId) || !validHostedPage(value.pageUrl, value.invoiceId)) throw new MonoError("MONO_INVALID_RESPONSE", {
    category: "invalid_response", endpoint: "invoice/create", httpStatus: 200,
    ...(value && validInvoiceId(value.invoiceId) ? { invoiceId: value.invoiceId } : {}),
  });
  return { invoiceId: value.invoiceId, pageUrl: value.pageUrl };
}

export async function invalidateUnpaidMonoInvoice(invoiceId: string) {
  if (!validInvoiceId(invoiceId)) throw new MonoError("MONO_INVALID_INPUT", { category: "local_validation", endpoint: "invoice/remove" });
  await api("/api/merchant/invoice/remove", { invoiceId }, true);
}

export function parseMonoSnapshot(value: unknown): MonoSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MonoError("MONO_INVALID_RESPONSE");
  const data = value as Record<string, unknown>;
  if (!validInvoiceId(data.invoiceId) || typeof data.reference !== "string" || !/^[\w-]{1,100}$/.test(data.reference) ||
      typeof data.status !== "string" || !/^[a-z_]{1,64}$/.test(data.status) ||
      !Number.isSafeInteger(data.amount) || (data.amount as number) <= 0 || !Number.isSafeInteger(data.ccy) ||
      typeof data.modifiedDate !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.modifiedDate) ||
      !Number.isFinite(Date.parse(data.modifiedDate))) throw new MonoError("MONO_INVALID_RESPONSE");
  if (data.finalAmount !== undefined && (!Number.isSafeInteger(data.finalAmount) || (data.finalAmount as number) < 0 || (data.finalAmount as number) > (data.amount as number))) throw new MonoError("MONO_INVALID_RESPONSE");
  if (data.cancelList !== undefined && (!Array.isArray(data.cancelList) || data.cancelList.length > 100 || data.cancelList.some((entry) => !entry || typeof entry !== "object" ||
      typeof entry.status !== "string" || !Number.isSafeInteger(entry.amount) || entry.amount < 0 || entry.ccy !== data.ccy))) throw new MonoError("MONO_INVALID_RESPONSE");
  // Pick only the fields used for validation/normalization. Never persist raw payloads.
  return {
    invoiceId: data.invoiceId, reference: data.reference, status: data.status, amount: data.amount as number, ccy: data.ccy as number,
    modifiedDate: data.modifiedDate,
    ...(typeof data.createdDate === "string" && Number.isFinite(Date.parse(data.createdDate)) ? { createdDate: data.createdDate } : {}),
    ...(data.finalAmount !== undefined ? { finalAmount: data.finalAmount as number } : {}),
    ...(typeof data.errCode === "string" && /^\d{1,10}$/.test(data.errCode) ? { errCode: data.errCode } : {}),
    ...(Array.isArray(data.cancelList) ? { cancelList: data.cancelList.map((entry) => ({ status: entry.status, amount: entry.amount, ccy: entry.ccy })) } : {}),
  };
}

export async function queryMonoInvoice(invoiceId: string) {
  if (!validInvoiceId(invoiceId)) throw new MonoError("MONO_INVALID_RESPONSE");
  return parseMonoSnapshot(await api(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`));
}

let cached: { key: KeyObject; tokenHash: string; fetchedAt: number } | undefined;
let fetching: Promise<KeyObject> | undefined;
let refreshAt = 0;
async function publicKey(force: boolean): Promise<KeyObject> {
  const now = Date.now();
  const tokenHash = createHash("sha256").update(readServerEnv("MONO_ACQUIRING_TOKEN")).digest("hex");
  if (cached?.tokenHash !== tokenHash) cached = undefined;
  if (fetching) return fetching;
  if (cached && (!force && now - cached.fetchedAt < 86400000 || now - refreshAt < 60000)) return cached.key;
  if (now - refreshAt < 60000 && !cached) throw new MonoError("MONO_UNAVAILABLE");
  refreshAt = now;
  fetching = (async () => {
    const result = await api("/api/merchant/pubkey") as { key?: unknown } | null;
    if (!result || typeof result.key !== "string" || result.key.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.key)) throw new MonoError("MONO_INVALID_RESPONSE");
    try {
      const key = createPublicKey(Buffer.from(result.key, "base64"));
      if (key.asymmetricKeyType !== "ec") throw new Error("INVALID_KEY");
      cached = { key, tokenHash, fetchedAt: now };
      return key;
    } catch { throw new MonoError("MONO_INVALID_RESPONSE"); }
  })();
  try { return await fetching; } finally { fetching = undefined; }
}

export async function verifyMonoSignature(raw: Buffer, signature: string | null): Promise<boolean> {
  if (!signature || signature.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  const bytes = Buffer.from(signature, "base64");
  if (bytes.toString("base64") !== signature || bytes.length < 64 || bytes.length > 144) return false;
  const check = (key: KeyObject) => { try { return verify("SHA256", raw, key, bytes); } catch { return false; } };
  const key = await publicKey(false);
  if (check(key)) return true;
  const refreshed = await publicKey(true);
  return refreshed !== key && check(refreshed);
}
