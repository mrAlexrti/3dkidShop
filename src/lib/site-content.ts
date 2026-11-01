import { z } from "zod";
import { httpMediaUrl } from "@/lib/product-media";
import { translations, type Locale } from "@/lib/i18n";

const optionalUrl = z.string().trim().pipe(z.union([z.literal(""), httpMediaUrl]));
export const storefrontContentSchema = z.object({
  hero_title_ua: z.string().trim().max(500),
  hero_title_en: z.string().trim().max(500),
  hero_subtitle_ua: z.string().trim().max(2000),
  hero_subtitle_en: z.string().trim().max(2000),
  hero_image_1: optionalUrl,
  hero_image_2: optionalUrl,
  hero_image_3: optionalUrl,
  social_instagram: optionalUrl,
  social_telegram: optionalUrl,
  social_tiktok: optionalUrl,
  social_youtube: optionalUrl,
}).partial();

export const STOREFRONT_CONTENT_KEYS = Object.keys(storefrontContentSchema.shape);
export type StorefrontContent = z.infer<typeof storefrontContentSchema>;

export function resolveHeroCopy(content: StorefrontContent, locale: Locale) {
  return {
    title: content[`hero_title_${locale}`]?.trim() || translations[locale].home.hero.title,
    subtitle: content[`hero_subtitle_${locale}`]?.trim() || translations[locale].home.hero.subtitle,
  };
}

export function safeContentUrl(value?: string): string | undefined {
  const result = httpMediaUrl.safeParse(value);
  return result.success ? result.data : undefined;
}
