// No credentials, personal data or authorization claims belong in callback_data.
const prefix = "ow1:";
export function orderWorkCallback(id: string) {
  if (id !== id.trim() || !/^[A-Za-z0-9_-]{1,48}$/.test(id)) throw new Error("INVALID_ORDER_CALLBACK_ID");
  return prefix + id; // <=52 ASCII bytes; Telegram permits 1–64 bytes.
}
export function parseOrderWorkCallback(value: unknown) {
  if (typeof value !== "string" || value !== value.trim() || !/^ow1:[A-Za-z0-9_-]{1,48}$/.test(value)) return null;
  return value.slice(prefix.length);
}
