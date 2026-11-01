import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { pages: { about } } = await getT();
  return { title: about.metaTitle, description: about.metaDescription, openGraph: { title: about.metaTitle, description: about.metaDescription } };
}

export default async function AboutPage() {
  const { pages: { about } } = await getT();
  return <article className="sf-shell sf-information">
    <h1>{about.title}</h1>
    <p className="sf-information-lead">{about.slogan}</p>
    {about.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
  </article>;
}
