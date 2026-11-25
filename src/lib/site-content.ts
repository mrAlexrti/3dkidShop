import { z } from "zod";
import { httpMediaUrl, storefrontImage } from "@/lib/product-media";
import { translations, type Locale } from "@/lib/i18n";

const optionalUrl = z.string().trim().pipe(z.union([z.literal(""), httpMediaUrl]));
export const ABOUT_CONTENT_LIMITS = { slogan: 500, body: 20000, meta_title: 160, meta_description: 320 } as const;
const aboutText = (limit: number) => z.string().trim().min(1).max(limit);
// Preserve the authored multiline body, including blank lines, in storage.
const aboutBody = z.string().min(1).max(ABOUT_CONTENT_LIMITS.body).refine((value) => Boolean(value.trim()), { message: "required" });
const aboutContentSchema = z.object({
  about_slogan_ua: aboutText(ABOUT_CONTENT_LIMITS.slogan),
  about_slogan_en: aboutText(ABOUT_CONTENT_LIMITS.slogan),
  about_body_ua: aboutBody,
  about_body_en: aboutBody,
  about_meta_title_ua: aboutText(ABOUT_CONTENT_LIMITS.meta_title),
  about_meta_title_en: aboutText(ABOUT_CONTENT_LIMITS.meta_title),
  about_meta_description_ua: aboutText(ABOUT_CONTENT_LIMITS.meta_description),
  about_meta_description_en: aboutText(ABOUT_CONTENT_LIMITS.meta_description),
});
export const ABOUT_CONTENT_KEYS = Object.keys(aboutContentSchema.shape);
export const ACCOUNT_ILLUSTRATIONS = {
  account_auth_image: "/hero/robot-v1.webp",
  account_welcome_image: "/hero/bunny-v1.webp",
} as const;

export const storefrontContentSchema = z.object({
  ...aboutContentSchema.shape,
  hero_title_ua: z.string().trim().max(500),
  hero_title_en: z.string().trim().max(500),
  hero_subtitle_ua: z.string().trim().max(2000),
  hero_subtitle_en: z.string().trim().max(2000),
  hero_image_1: optionalUrl,
  hero_image_2: optionalUrl,
  hero_image_3: optionalUrl,
  account_auth_image: optionalUrl,
  account_welcome_image: optionalUrl,
  social_instagram: optionalUrl,
  social_telegram: optionalUrl,
  social_tiktok: optionalUrl,
  social_youtube: optionalUrl,
}).partial();

export const STOREFRONT_CONTENT_KEYS = Object.keys(storefrontContentSchema.shape);
export type StorefrontContent = z.infer<typeof storefrontContentSchema>;

export function resolveAboutCopy(content: StorefrontContent, locale: Locale) {
  const fallback = translations[locale].pages.about;
  const value = (field: keyof typeof ABOUT_CONTENT_LIMITS, defaultValue: string) => {
    const saved = content[`about_${field}_${locale}`];
    return saved?.trim() ? saved : defaultValue;
  };
  return {
    slogan: value("slogan", fallback.slogan),
    body: value("body", fallback.paragraphs.join("\n\n")),
    metaTitle: value("meta_title", fallback.metaTitle),
    metaDescription: value("meta_description", fallback.metaDescription),
  };
}

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

export function resolveAccountIllustration(content: StorefrontContent, key: keyof typeof ACCOUNT_ILLUSTRATIONS) {
  const fallback = ACCOUNT_ILLUSTRATIONS[key];
  const src = safeContentUrl(content[key]) ?? fallback;
  return { src, fallback, unoptimized: storefrontImage(src) !== src };
}
