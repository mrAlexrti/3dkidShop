import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeBase32(value: string) {
  return value.replace(/[\s=-]/g, "").toUpperCase();
}

function base32ToBuffer(secret: string) {
  const normalized = normalizeBase32(secret);
  let bits = "";

  for (const char of normalized) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error("Invalid base32 secret");
    }
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }

  return Buffer.from(bytes);
}

function counterToBuffer(counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  return buffer;
}

function generateTotpCode(secret: string, timeStep: number) {
  const key = base32ToBuffer(secret);
  const hmac = crypto.createHmac("sha1", key).update(counterToBuffer(timeStep)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function verifyTotpCode(secret: string, code: string, window = 1) {
  const normalizedCode = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  const currentStep = Math.floor(Date.now() / 30_000);
  for (let drift = -window; drift <= window; drift += 1) {
    if (safeEqual(generateTotpCode(secret, currentStep + drift), normalizedCode)) {
      return true;
    }
  }

  return false;
}
