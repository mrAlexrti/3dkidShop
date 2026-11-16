// PostgreSQL Int quantity and Decimal(10,2) order subtotal limits, not inventory.
export const MAX_QUANTITY = 2147483647;
export const MAX_CART_LINES = 100;
export const MAX_TOTAL_MINOR = 9999999999;
export const validQuantity = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_QUANTITY;
export function priceMinor(value: number) {
  const minor = Math.round(value * 100);
  return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(minor) && minor <= MAX_TOTAL_MINOR && Math.abs(value * 100 - minor) < 0.00001 ? minor : null;
}
export function cartTotalMinor(items: { price: number; quantity: number }[]) {
  let total = 0;
  for (const item of items) {
    const minor = priceMinor(item.price);
    if (minor === null || !validQuantity(item.quantity)) return null;
    total += minor * item.quantity;
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL_MINOR) return null;
  }
  return total;
}
export function canSetQuantity(items: { id: string; price: number; quantity: number }[], id: string, quantity: number) {
  return validQuantity(quantity) && (items.some((item) => item.id === id && quantity < item.quantity) ||
    cartTotalMinor(items.map((item) => item.id === id ? { ...item, quantity } : item)) !== null);
}
