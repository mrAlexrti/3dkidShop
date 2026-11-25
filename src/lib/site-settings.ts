import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { resolveFontTheme, type FontThemeId } from "@/lib/fonts";
import { STOREFRONT_CONTENT_KEYS, type StorefrontContent } from "@/lib/site-content";
import { brandName } from "@/lib/seo-config";

export const SITE_FONT_KEY = "site_font";

const getSettings = cache(async () => {
  const rows = await prisma.siteContent.findMany({
    where: { key: { in: [...STOREFRONT_CONTENT_KEYS, SITE_FONT_KEY] } }, select: { key: true, value: true },
  });
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
});

export const getStorefrontContent = cache(async (): Promise<StorefrontContent> => {
  const settings = await getSettings();
  return Object.fromEntries(STOREFRONT_CONTENT_KEYS.flatMap((key) => settings[key] === undefined ? [] : [[key, settings[key]]]));
});

export const getSiteDisplayName = cache(async () => {
  try {
    return (await getSettings()).seo_site_name?.trim() || brandName;
  } catch {
    return brandName;
  }
});

// cache() дедуплицирует запрос в рамках одного рендера.
// try/catch — чтобы отсутствие БД (например при статической генерации) не ломало layout.
export const getFontThemeId = cache(async (): Promise<FontThemeId> => {
  try {
    const settings = await getSettings();
    return resolveFontTheme(settings[SITE_FONT_KEY]);
  } catch {
    return resolveFontTheme(undefined);
  }
});
