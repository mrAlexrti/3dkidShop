"use client";

import { useActionState, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Eye, EyeOff } from "lucide-react";
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

export function GoogleForm({ intent = "signin" }: { intent?: "signin" | "register" | "link" }) {
  const { t } = useLangStore();
  const link = intent === "link";
  const label = link ? t.account.googleContinue : intent === "register" ? t.account.googleRegister : t.account.google;
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
    <button type="submit" disabled={pending} className="ac-google-button">
      <Image src="/identity/google-g.png" width={200} height={204} sizes="18px" alt="" />
      <span>{label}</span>
    </button>
    {error && <p className="ac-feedback" role="alert">{t.account.result[error]}</p>}
  </form>;
}

function PasswordInput(props: ComponentPropsWithoutRef<"input">) {
  const { t } = useLangStore();
  const [revealed, setRevealed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const label = revealed ? t.account.hidePassword : t.account.showPassword;
  const Icon = revealed ? EyeOff : Eye;

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const conceal = () => setRevealed(false);
    form.addEventListener("submit", conceal);
    form.addEventListener("reset", conceal);
    return () => {
      form.removeEventListener("submit", conceal);
      form.removeEventListener("reset", conceal);
    };
  }, []);

  return <div className="ac-password">
    <input {...props} ref={input} type={revealed ? "text" : "password"} />
    <button type="button" className="ac-password-toggle" aria-label={label} title={label} aria-controls={props.id}
      onClick={() => setRevealed((visible) => !visible)}><Icon size={19} aria-hidden="true" /></button>
  </div>;
}

export function AccountField({ label, name, type = "text", defaultValue, autoComplete, required = true, maxLength, help }: {
  label: string; name: string; type?: string; defaultValue?: string | null; autoComplete?: string; required?: boolean; maxLength?: number; help?: string;
}) {
  const id = useId();
  const props = { id, name, defaultValue: defaultValue ?? undefined, autoComplete, required, maxLength,
    "aria-describedby": help ? `${id}-help` : undefined };
  return <div className="ac-field">
    <label htmlFor={id}>{label}</label>
    {type === "password" ? <PasswordInput {...props} /> : <input {...props} type={type} />}
    {help && <small id={`${id}-help`}>{help}</small>}
  </div>;
}
