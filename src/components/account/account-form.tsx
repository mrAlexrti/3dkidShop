"use client";

import { useActionState, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Globe } from "lucide-react";
import { useLangStore } from "@/store/lang-store";
import type { AccountResult } from "@/lib/customer/actions";
import type { GoogleResult } from "@/lib/customer/google";

type Action = (state: AccountResult | null, data: FormData) => Promise<AccountResult>;
export function AccountForm({ action, button, children, token = false, done, refresh = false }: {
  action: Action; button: string; children?: ReactNode; token?: boolean; done?: string; refresh?: boolean;
}) {
  const [result, submit, pending] = useActionState(action, null);
  const [proof, setProof] = useState<string | null>(null);
  const { t } = useLangStore();
  const router = useRouter();
  useEffect(() => {
    if (!token) return;
    const value = window.location.hash.slice(1);
    setProof(value);
    if (value) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    const newLink = () => { if (window.location.hash) window.location.reload(); };
    window.addEventListener("hashchange", newLink);
    return () => window.removeEventListener("hashchange", newLink);
  }, [token]);
  useEffect(() => {
    if (refresh && result === "ok") router.refresh();
  }, [refresh, result, router]);
  const finished = !!done && (result === "ok" || (token && result === "sent"));
  const successful = result === "ok" || result === "sent";
  return <form action={submit} className="ac-form" aria-busy={pending}>
    <fieldset disabled={pending || finished}>
      {children}
      {token && <input type="hidden" name="token" value={proof ?? ""} />}
      <button type="submit" disabled={token && !proof} className="ac-button">
        {pending ? t.common.loading : button}
      </button>
    </fieldset>
    {token && proof === "" && <p className="ac-feedback" role="alert">{t.account.result.invalid}</p>}
    {typeof result === "string" && <p role={successful ? "status" : "alert"} className={`ac-feedback${successful ? " ac-feedback--success" : ""}`}>
      {successful && <CircleCheck size={19} aria-hidden="true" />}{t.account.result[result]}
    </p>}
    {finished && <Link className="ac-text-link" href={done} prefetch={false}>{done === "/account/sign-in" ? t.account.signIn : t.account.title}<ArrowRight size={16} aria-hidden="true" /></Link>}
  </form>;
}

export function GoogleForm({ link = false }: { link?: boolean }) {
  const { t } = useLangStore();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof typeof t.account.result>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const data = new URLSearchParams({ mode: link ? "link" : "signin", password: String(fields.get("password") ?? "") });
    inFlight.current = true;
    setError(undefined);
    setPending(true);
    try {
      const response = await fetch("/api/customer-auth/start/google", { method: "POST", body: data, cache: "no-store" });
      if (!response.ok) throw new Error("GOOGLE_START_FAILED");
      const result = await response.json() as GoogleResult;
      if ("url" in result) {
        window.location.assign(result.url);
        return;
      }
      setError(result.error);
    } catch {
      setError("failed");
    }
    form.reset();
    inFlight.current = false;
    setPending(false);
  }
  return <form method="post" action="/api/customer-auth/start/google" onSubmit={submit} className="ac-form" aria-busy={pending}>
    <input type="hidden" name="mode" value={link ? "link" : "signin"} />
    {link && <AccountField name="password" label={t.account.password} type="password" autoComplete="current-password" maxLength={72} />}
    <button type="submit" disabled={pending} className="ac-button ac-button--soft">
      <Globe size={19} aria-hidden="true" />{pending ? t.common.loading : link ? t.account.linkGoogle : t.account.google}
    </button>
    {error && <p className="ac-feedback" role="alert">{t.account.result[error]}</p>}
  </form>;
}

export function AccountField({ label, name, type = "text", defaultValue, autoComplete, required = true, maxLength, help }: {
  label: string; name: string; type?: string; defaultValue?: string | null; autoComplete?: string; required?: boolean; maxLength?: number; help?: string;
}) {
  const id = useId();
  return <div className="ac-field">
    <label htmlFor={id}>{label}</label>
    <input id={id} name={name} type={type} defaultValue={defaultValue ?? undefined} autoComplete={autoComplete} required={required} maxLength={maxLength}
      aria-describedby={help ? `${id}-help` : undefined} />
    {help && <small id={`${id}-help`}>{help}</small>}
  </div>;
}
