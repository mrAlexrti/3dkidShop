import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { resolveFontTheme, type FontThemeId } from "@/lib/fonts";

export const SITE_FONT_KEY = "site_font";

// cache() дедуплицирует запрос в рамках одного рендера.
// try/catch — чтобы отсутствие БД (например при статической генерации) не ломало layout.
export const getFontThemeId = cache(async (): Promise<FontThemeId> => {
  try {
    const row = await prisma.siteContent.findUnique({
      where: { key: SITE_FONT_KEY },
    });
    return resolveFontTheme(row?.value);
  } catch {
    return resolveFontTheme(undefined);
  }
});
