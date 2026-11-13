// Parse Decimal's string form without floating-point multiplication/rounding.
export function moneyMinorUnits(value: unknown): number | null {
  const text = typeof value === "number" || typeof value === "string" ? String(value) : "";
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function moneyDecimal(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > 9999999999) throw new Error("INVALID_AMOUNT");
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
