import crypto from "crypto";

const LIQPAY_CHECKOUT_URL = "https://www.liqpay.ua/api/3/checkout";

export type LiqPayCheckout = {
  provider: "liqpay";
  action: string;
  data: string;
  signature: string;
};

type LiqPayPaymentPayload = {
  version: number;
  public_key: string;
  action: "pay";
  amount: number;
  currency: "UAH";
  description: string;
  order_id: string;
  server_url: string;
  result_url: string;
  sandbox?: 1;
};

type PublicLiqPayPaymentPayload = Omit<LiqPayPaymentPayload, "public_key"> & {
  public_key: string;
};

export type LiqPayCallbackPayload = {
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  transaction_id?: number;
};

function readEnv(name: string) {
  const rawValue = process.env[name];
  const trimmedValue = rawValue?.trim() ?? "";

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1).trim();
  }

  return trimmedValue;
}

function getPrivateKey() {
  return readEnv("LIQPAY_PRIVATE_KEY");
}

function getPublicKey() {
  return readEnv("LIQPAY_PUBLIC_KEY");
}

function isSandboxEnabled() {
  return readEnv("LIQPAY_SANDBOX") === "1" || readEnv("liqpay_sandbox") === "1";
}

function isDebugEnabled() {
  return readEnv("LIQPAY_DEBUG") === "1";
}

function maskValue(value: string) {
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function sanitizePayload(payload: LiqPayPaymentPayload): PublicLiqPayPaymentPayload {
  return {
    ...payload,
    public_key: maskValue(payload.public_key),
  };
}

export function isLiqPayConfigured() {
  return Boolean(getPublicKey() && getPrivateKey());
}

export function getLiqPayConfigStatus() {
  return {
    hasPublicKey: Boolean(getPublicKey()),
    hasPrivateKey: Boolean(getPrivateKey()),
    hasSiteUrl: Boolean(readEnv("NEXT_PUBLIC_SITE_URL") || readEnv("SITE_URL") || readEnv("VERCEL_URL")),
    publicKeyLooksSandbox: getPublicKey().startsWith("sandbox_"),
    privateKeyLooksSandbox: getPrivateKey().startsWith("sandbox_"),
    sandbox: isSandboxEnabled(),
  };
}

export function getMissingLiqPayEnvNames() {
  const status = getLiqPayConfigStatus();
  return [
    !status.hasPublicKey ? "LIQPAY_PUBLIC_KEY" : null,
    !status.hasPrivateKey ? "LIQPAY_PRIVATE_KEY" : null,
  ].filter(Boolean);
}

function getSiteUrl() {
  const explicitUrl = readEnv("NEXT_PUBLIC_SITE_URL") || readEnv("SITE_URL");
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const vercelUrl = readEnv("VERCEL_URL");
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  return "http://localhost:3000";
}

export function signLiqPayData(data: string) {
  return crypto
    .createHash("sha1")
    .update(getPrivateKey() + data + getPrivateKey())
    .digest("base64");
}

export function createLiqPayCheckout({
  orderNumber,
  amount,
}: {
  orderNumber: string;
  amount: number;
}): LiqPayCheckout {
  if (!isLiqPayConfigured()) {
    throw new Error("LIQPAY_NOT_CONFIGURED");
  }

  const siteUrl = getSiteUrl();
  const payload: LiqPayPaymentPayload = {
    version: 3,
    public_key: getPublicKey(),
    action: "pay",
    amount: Number(amount.toFixed(2)),
    currency: "UAH",
    description: `Оплата замовлення ${orderNumber} в 3D Kid`,
    order_id: orderNumber,
    server_url: `${siteUrl}/api/payments/liqpay/callback`,
    result_url: `${siteUrl}/checkout/success?order=${encodeURIComponent(orderNumber)}&payment=return`,
    ...(isSandboxEnabled() ? { sandbox: 1 } : {}),
  };

  if (isDebugEnabled()) {
    console.info("LiqPay checkout payload", sanitizePayload(payload));
  }

  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

  return {
    provider: "liqpay",
    action: LIQPAY_CHECKOUT_URL,
    data,
    signature: signLiqPayData(data),
  };
}

export function parseLiqPayCallback(data: string): LiqPayCallbackPayload {
  return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as LiqPayCallbackPayload;
}

export function isValidLiqPaySignature(data: string, signature: string) {
  return signLiqPayData(data) === signature;
}

export function isPaidLiqPayStatus(status?: string) {
  return status === "success" || status === "sandbox";
}

export function isFailedLiqPayStatus(status?: string) {
  return ["failure", "error", "reversed"].includes(status ?? "");
}
