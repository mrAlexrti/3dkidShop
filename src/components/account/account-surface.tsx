import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

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

export function AccountAuthFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="ac-auth">
    <div className="ac-auth-art" aria-hidden="true">
      <span className="ac-auth-spark"><Sparkles size={36} /></span>
      <Image src="/hero/robot-v1.webp" alt="" width={360} height={360} sizes="(min-width: 780px) 300px, 1px" />
    </div>
    <div className="ac-auth-body">
      <AccountIntro title={title} description={description} />
      {children}
    </div>
  </section>;
}
