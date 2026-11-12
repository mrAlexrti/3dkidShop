import { normalizedStatuses, type StatusSnapshot } from "@/lib/status";

export const NOTIFICATION_EVENTS = [
  "ORDER_CREATED", "ORDER_CONFIRMED", "ORDER_PROCESSING", "ORDER_CANCELLED", "ORDER_COMPLETED",
  "PAYMENT_PENDING", "PAYMENT_PAID", "PAYMENT_FAILED", "PAYMENT_CANCELLED", "PAYMENT_REFUNDED",
  "DELIVERY_TTN_CREATED", "DELIVERY_SHIPPED", "DELIVERY_IN_TRANSIT", "DELIVERY_ARRIVED", "DELIVERY_DELIVERED", "DELIVERY_RETURNED",
] as const;
export type NotificationEvent = typeof NOTIFICATION_EVENTS[number];
// No independent confirmation operation exists yet. Never infer merchant
// confirmation from a payment provider response.
export const CONFIGURABLE_EVENTS = NOTIFICATION_EVENTS.filter((event) => event !== "ORDER_CONFIRMED");
export type NotificationChannel = "telegram" | "email";
export type NotificationSettings = Record<NotificationChannel, Record<NotificationEvent, boolean>>;
export const NOTIFICATION_SETTINGS_KEY = "notification_settings_v1";

export function defaultNotificationSettings(): NotificationSettings {
  const telegramDefaults: NotificationEvent[] = ["ORDER_CREATED", "ORDER_PROCESSING", "ORDER_CANCELLED", "ORDER_COMPLETED", "PAYMENT_PAID", "DELIVERY_TTN_CREATED", "DELIVERY_DELIVERED"];
  return {
    telegram: Object.fromEntries(NOTIFICATION_EVENTS.map((event) => [event, telegramDefaults.includes(event)])) as NotificationSettings["telegram"],
    email: Object.fromEntries(NOTIFICATION_EVENTS.map((event) => [event, event === "ORDER_CREATED"])) as NotificationSettings["email"],
  };
}

export function parseNotificationSettings(value?: string | null): NotificationSettings {
  const settings = defaultNotificationSettings();
  if (value == null) return settings;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_NOTIFICATION_SETTINGS");
  for (const channel of ["telegram", "email"] as const) {
    const flags = (parsed as Record<string, unknown>)[channel];
    if (!flags || typeof flags !== "object" || Array.isArray(flags)) throw new Error("INVALID_NOTIFICATION_SETTINGS");
    for (const event of NOTIFICATION_EVENTS) {
      const flag = (flags as Record<string, unknown>)[event];
      if (flag !== undefined && typeof flag !== "boolean") throw new Error("INVALID_NOTIFICATION_SETTINGS");
      if (typeof flag === "boolean") settings[channel][event] = flag;
    }
  }
  return settings;
}

export function notificationEvents(before: StatusSnapshot | null, after: StatusSnapshot): NotificationEvent[] {
  const next = normalizedStatuses(after);
  if (!before) return ["ORDER_CREATED", ...(next.payment === "PENDING" ? ["PAYMENT_PENDING" as const] : [])];
  const previous = normalizedStatuses(before);
  const events: NotificationEvent[] = [];
  if (previous.order !== next.order && next.order !== "NEW") events.push(`ORDER_${next.order}`);
  if (previous.payment !== next.payment && next.payment !== "UNKNOWN") events.push(`PAYMENT_${next.payment}`);
  if (after.novaPoshtaTtn && after.novaPoshtaTtn !== before.novaPoshtaTtn) events.push("DELIVERY_TTN_CREATED");
  if (previous.delivery !== next.delivery && next.delivery !== "UNKNOWN" && next.delivery !== "NOT_CREATED" && next.delivery !== "TTN_CREATED") events.push(`DELIVERY_${next.delivery}`);
  return events;
}
