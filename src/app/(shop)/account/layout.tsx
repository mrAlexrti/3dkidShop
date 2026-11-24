import { getT } from "@/lib/i18n-server";
import "./account.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT()).account.title, robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="sf-shell ac-shell">{children}</div>;
}
