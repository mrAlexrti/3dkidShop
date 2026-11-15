// Contact text is rendered by React (escaped). Only conservative, validated
// values become URI actions; malformed/legacy values remain plain text.
export function contactText(value: unknown, limit = 254): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= limit && !/[\p{Cc}\p{Cf}]/u.test(text) ? text : null;
}

export function phoneHref(value: string | null) {
  if (!value || !/^\+?[\d ()-]{7,32}$/.test(value)) return null;
  const number = value.replace(/[ ()-]/g, "");
  return /^\+?\d{7,15}$/.test(number) ? `tel:${number}` : null;
}

export function emailHref(value: string | null) {
  return value && /^[A-Za-z0-9.!$'*+_=-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value)
    ? `mailto:${encodeURIComponent(value).replace(/%40/g, "@")}` : null;
}
