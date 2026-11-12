import { prisma } from "@/lib/prisma";
import { NOTIFICATION_SETTINGS_KEY, parseNotificationSettings } from "./events";

// Read fresh for every event batch. A failed read must never enable a channel
// that the owner may have disabled.
export async function getNotificationSettings() {
  const row = await prisma.siteContent.findUnique({ where: { key: NOTIFICATION_SETTINGS_KEY } });
  return parseNotificationSettings(row?.value);
}
