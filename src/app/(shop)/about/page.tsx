import type { Metadata } from "next";
import { cache } from "react";
import { getLocale } from "@/lib/i18n-server";
import { resolveAboutCopy } from "@/lib/site-content";
import { getStorefrontContent } from "@/lib/site-settings";
import { pageSeo, resolveSeo } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Metadata and body share one request-scoped snapshot, never a cross-locale cache.
const getAboutContent = cache(async () => {
  const [locale, content] = await Promise.all([getLocale(), getStorefrontContent()]);
  return { ...resolveAboutCopy(content, locale), locale, seo: resolveSeo(content, locale) };
});

export async function generateMetadata(): Promise<Metadata> {
  const about = await getAboutContent();
  return pageSeo({ seo: about.seo, path: "/about", locale: about.locale, title: about.metaTitle, description: about.metaDescription });
}

export default async function AboutPage() {
  const about = await getAboutContent();
  return <article className="sf-shell sf-information">
    <h1 className="sf-information-lead">{about.slogan}</h1>
    {about.body.replace(/\r\n?/g, "\n").split(/\n[\t ]*\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}
  </article>;
}
