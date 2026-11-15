import type { Locale } from "./i18n";

export const MANAGER_TIME_ZONE = "Europe/Kyiv";
const formatter = (locale: Locale) => new Intl.DateTimeFormat(locale === "ua" ? "uk-UA" : "en-GB", {
  timeZone: MANAGER_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const formats = { ua: formatter("ua"), en: formatter("en") };

export function formatManagerDateTime(value: Date | null | undefined, locale: Locale = "ua") {
  if (!value || !Number.isFinite(value.getTime())) return "—";
  const parts = Object.fromEntries(formats[locale].formatToParts(value).map(({ type, value }) => [type, value]));
  const separator = locale === "ua" ? "." : "/";
  return `${parts.day}${separator}${parts.month}${separator}${parts.year}, ${parts.hour}:${parts.minute}`;
}

// Convert a calendar midnight in Kyiv to an instant, using the timezone's actual
// offset on that date. Convert the next midnight separately: DST days are 23/25h.
export function kyivDayBoundary(value: string, nextDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value || day.getUTCFullYear() < 2000 || day.getUTCFullYear() > 9998) return null;
  if (nextDay) day.setUTCDate(day.getUTCDate() + 1);
  const wallTime = day.getTime();
  let instant = wallTime;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formats.en.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    instant += wallTime - represented;
  }
  return new Date(instant);
}
