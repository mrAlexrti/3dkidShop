import type { Metadata } from "next";
import { translations, type Locale } from "@/lib/i18n";
import type { StorefrontContent } from "@/lib/site-content";
import { absoluteSeoImage, brandMark, brandName, defaultSocialImage, siteOrigin } from "./seo-config";

export function resolveSeo(content: StorefrontContent, locale: Locale) {
  const defaults = translations[locale].seo;
  const image = absoluteSeoImage(content.seo_social_image);
  return {
    name: content.seo_site_name?.trim() || brandName,
    title: content[`seo_home_title_${locale}`]?.trim() || defaults.homeTitle,
    description: content[`seo_home_description_${locale}`]?.trim() || defaults.homeDescription,
    image: {
      url: image ?? new URL(defaultSocialImage, siteOrigin).href,
      alt: defaults.imageAlt,
      ...(image ? {} : { width: 1200, height: 630 }),
    },
  };
}

export function pageSeo({ seo, path, locale, title, description, image = seo.image, home = false, noindex = false }: {
  seo: ReturnType<typeof resolveSeo>; path: string; locale: Locale; title: string; description: string;
  image?: { url: string; alt: string; width?: number; height?: number } | null; home?: boolean; noindex?: boolean;
}): Metadata {
  const url = new URL(path, siteOrigin).href;
  const shareTitle = home || title === seo.name ? title : `${title} | ${seo.name}`;
  return {
    title: home || title === seo.name ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", title: shareTitle, description, url, siteName: seo.name,
      locale: locale === "ua" ? "uk_UA" : "en_US", ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: shareTitle, description, ...(image ? { images: [image] } : {}) },
  };
}

export function siteIdentity(name: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${siteOrigin}/#website`, url: `${siteOrigin}/`, name, inLanguage: ["uk", "en"],
        publisher: { "@id": `${siteOrigin}/#store` } },
      { "@type": "OnlineStore", "@id": `${siteOrigin}/#store`, url: `${siteOrigin}/`, name,
        logo: { "@type": "ImageObject", url: new URL(brandMark, siteOrigin).href, width: 256, height: 256 } },
    ],
  };
}

export function breadcrumb(items: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(({ name, path }, index) => ({
    "@type": "ListItem", position: index + 1, name, item: new URL(path, siteOrigin).href,
  })) };
}
