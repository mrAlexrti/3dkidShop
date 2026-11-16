import type { Metadata } from "next";
import { cache } from "react";
import { getLocale } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { ABOUT_CONTENT_KEYS, resolveAboutCopy } from "@/lib/site-content";

export const dynamic = "force-dynamic";

// Metadata and body share one request-scoped snapshot, never a cross-locale cache.
const getAboutContent = cache(async () => {
  const locale = await getLocale();
  const rows = await prisma.siteContent.findMany({ where: { key: { in: ABOUT_CONTENT_KEYS } }, select: { key: true, value: true } });
  return resolveAboutCopy(Object.fromEntries(rows.map((row) => [row.key, row.value])), locale);
});

export async function generateMetadata(): Promise<Metadata> {
  const about = await getAboutContent();
  return { title: about.metaTitle, description: about.metaDescription, openGraph: { title: about.metaTitle, description: about.metaDescription } };
}

export default async function AboutPage() {
  const about = await getAboutContent();
  return <article className="sf-shell sf-information">
    <h1 className="sf-information-lead">{about.slogan}</h1>
    {about.body.replace(/\r\n?/g, "\n").split(/\n[\t ]*\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}
  </article>;
}
