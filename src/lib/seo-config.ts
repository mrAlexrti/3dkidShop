export const siteOrigin = "https://www.3dkid.shop";
export const brandName = "3D kid";
export const storefrontLogo = { src: "/hero/storefront-logo.png", width: 282, height: 314 } as const;
export const emailBrandArtwork = { src: "/hero/logo.png", width: 409, height: 369 } as const;
export const brandMark = "/seo/brand-mark.png";
export const defaultSocialImage = "/seo/store-share.jpg";
export const faviconPath = "/favicon-96.png";
export const seoLimits = { title: 120, description: 320, name: 60 } as const;

export function productPath(slug: string) {
  return `/product/${encodeURIComponent(slug)}`;
}

export function catalogPath(category?: string, page = 1) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  return params.size ? `/catalog?${params}` : "/catalog";
}

export function absoluteSeoImage(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
      ? new URL(value, siteOrigin) : new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Ignore malformed media references. */ }
}
