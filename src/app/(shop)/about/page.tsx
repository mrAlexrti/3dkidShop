import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { pages: { about } } = await getT();
  return { title: about.metaTitle, description: about.metaDescription, openGraph: { title: about.metaTitle, description: about.metaDescription } };
}

export default async function AboutPage() {
  const { pages: { about } } = await getT();
  return <article className="sf-shell sf-information">
    <h1 className="sf-information-lead">{about.slogan}</h1>
    {about.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
  </article>;
}
