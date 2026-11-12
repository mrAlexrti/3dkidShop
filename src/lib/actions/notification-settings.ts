"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "./require-admin";
import { CONFIGURABLE_EVENTS, defaultNotificationSettings, NOTIFICATION_SETTINGS_KEY } from "@/lib/notifications/events";

export async function updateNotificationSettings(form: FormData) {
  await requireAdmin();
  const settings = defaultNotificationSettings();
  for (const channel of ["telegram", "email"] as const) {
    for (const event of CONFIGURABLE_EVENTS) {
      const value = form.get(`${channel}.${event}`);
      if (value !== null && value !== "on") throw new Error("INVALID_NOTIFICATION_SETTING");
      settings[channel][event] = value === "on";
    }
  }
  const value = JSON.stringify(settings);
  await prisma.siteContent.upsert({ where: { key: NOTIFICATION_SETTINGS_KEY }, create: { key: NOTIFICATION_SETTINGS_KEY, value }, update: { value } });
  revalidatePath("/admin/content");
}
