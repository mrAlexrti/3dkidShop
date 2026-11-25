import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { AccountIllustration } from "./account-illustration";
import { resolveAccountIllustration } from "@/lib/site-content";
import { getStorefrontContent } from "@/lib/site-settings";

export function AccountIntro({ title, description }: { title: string; description?: string }) {
  return <header className="ac-intro"><h1>{title}</h1>{description && <p>{description}</p>}</header>;
}

export function AccountPanel({ title, description, mark, children }: { title: string; description?: string; mark?: ReactNode; children: ReactNode }) {
  return <section className="ac-panel">
    <header className="ac-panel-heading">
      {mark && <span className="ac-mark" aria-hidden="true">{mark}</span>}
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
    </header>
    {children}
  </section>;
}

export function AccountEmpty({ title, description, cta, icon }: { title: string; description: string; cta: string; icon: ReactNode }) {
  return <div className="ac-empty">
    <span className="ac-mark" aria-hidden="true">{icon}</span>
    <p className="ac-empty-title" role="status">{title}</p>
    <p>{description}</p>
    <Link className="ac-button ac-button--soft" href="/catalog">{cta}<ArrowRight size={17} aria-hidden="true" /></Link>
  </div>;
}

export async function AccountAuthFrame({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  const content = await getStorefrontContent();
  return <section className="ac-auth">
    <div className="ac-auth-art" aria-hidden="true">
      <span className="ac-auth-spark"><Sparkles size={36} /></span>
      <AccountIllustration {...resolveAccountIllustration(content, "account_auth_image")} auth />
    </div>
    <div className="ac-auth-body">
      {title && <AccountIntro title={title} description={description} />}
      {children}
    </div>
  </section>;
}
