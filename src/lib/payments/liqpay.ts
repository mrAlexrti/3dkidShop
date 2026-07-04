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

export type LiqPayCallbackPayload = {
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  transaction_id?: number;
};

function getPrivateKey() {
  return process.env.LIQPAY_PRIVATE_KEY?.trim() ?? "";
}

function getPublicKey() {
  return process.env.LIQPAY_PUBLIC_KEY?.trim() ?? "";
}

export function isLiqPayConfigured() {
  return Boolean(getPublicKey() && getPrivateKey());
}

function getSiteUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL;
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
    amount,
    currency: "UAH",
    description: `Оплата замовлення ${orderNumber} в 3D Kid`,
    order_id: orderNumber,
    server_url: `${siteUrl}/api/payments/liqpay/callback`,
    result_url: `${siteUrl}/checkout/success?order=${encodeURIComponent(orderNumber)}&payment=return`,
    ...(process.env.LIQPAY_SANDBOX === "1" ? { sandbox: 1 } : {}),
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64");

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
