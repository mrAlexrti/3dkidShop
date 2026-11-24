import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT()).account.title, robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="container-shop max-w-5xl space-y-5 py-8 sm:py-12">{children}</div>;
}
