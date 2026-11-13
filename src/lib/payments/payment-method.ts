// Stored checkout labels predate a machine payment-method column. Exact aliases
// preserve historical orders without treating arbitrary text containing "cod" as COD.
export function isCashOnDelivery(method: string | null | undefined): boolean {
  return new Set(["cash_on_delivery", "накладений платіж", "cash on delivery", "cod"]).has((method ?? "").trim().replace(/\s+/g, " ").toLowerCase());
}
