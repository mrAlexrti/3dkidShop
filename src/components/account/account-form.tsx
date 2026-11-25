"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Eye, EyeOff } from "lucide-react";
import { useLangStore } from "@/store/lang-store";
import type { AccountResult } from "@/lib/customer/actions";
import type { GoogleResult } from "@/lib/customer/google";
import type { EmailPurpose } from "@/lib/customer/challenges";
import { passwordCreationError } from "@/lib/customer/password";

type Action = (state: AccountResult | null, data: FormData) => Promise<AccountResult>;
export function AccountForm({ action, button, children, intro, token = false, done, refresh = false, confirmMode, retainOnError = false }: {
  action: Action; button: string; children?: ReactNode; intro?: ReactNode; token?: boolean; done?: string; refresh?: boolean; confirmMode?: EmailPurpose; retainOnError?: boolean;
}) {
  const [result, submit, pending] = useActionState(action, null);
  const [proof, setProof] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<ReturnType<typeof passwordCreationError>>(null);
  const submitting = useRef(false);
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
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
  useEffect(() => { if (!pending) submitting.current = false; }, [pending, result]);
  const passwordMode = confirmMode === "register" || confirmMode === "reset" || confirmMode === "addPassword" ? confirmMode : null;
  const retain = retainOnError || !!passwordMode;
  useEffect(() => {
    if (!retain) return;
    const abandon = () => form.current?.reset();
    window.addEventListener("pagehide", abandon);
    return () => window.removeEventListener("pagehide", abandon);
  }, [retain]);
  const completion = result === "ok" && passwordMode ? t.account.completion[passwordMode] : null;
  const completed = Boolean(completion);
  useEffect(() => {
    if (completed) completionHeading.current?.focus();
  }, [completed]);
  if (completion) return <section className="ac-auth-state ac-auth-state--complete">
    <CircleCheck size={40} aria-hidden="true" />
    <div className="ac-intro" role="status">
      <h1 ref={completionHeading} tabIndex={-1} className="ac-status-heading">{completion.title}</h1>
      <p>{completion.detail}</p>
    </div>
    <Link className="ac-button" href="/account/sign-in" prefetch={false}>{t.account.signIn}<ArrowRight size={16} aria-hidden="true" /></Link>
  </section>;

  function validate(event: FormEvent<HTMLFormElement>) {
    if (submitting.current || (token && !proof)) {
      event.preventDefault();
      return;
    }
    if (passwordMode) {
      const data = new FormData(event.currentTarget);
      const problem = passwordCreationError(data.get("password"), data.get("confirmPassword"));
      setFieldError(problem);
      if (problem) {
        event.preventDefault();
        event.currentTarget.querySelector<HTMLInputElement>(problem === "passwordMismatch" ? '[name="confirmPassword"]' : '[name="password"]')?.focus();
        return;
      }
    }
    submitting.current = true;
    if (retain) {
      // Dispatch directly so React does not reset uncontrolled fields on an
      // operational rejection. Passwords stay in this form's DOM and FormData.
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => submit(data));
    }
  }
  const finished = !!done && (result === "ok" || (token && result === "sent"));
  const successful = result === "ok" || result === "sent";
  const shown = fieldError || result;
  const invalidLink = token && (proof === "" || (result === "invalid" && !fieldError));
  const recovery = confirmMode === "register" || confirmMode === "reset" ? `/account/sign-in?mode=${confirmMode}` : "/account/profile";
  return <>{intro}<form ref={form} action={submit} onSubmit={validate} className="ac-form" aria-busy={pending}>
    <fieldset disabled={pending || finished}>
      {children}
      {token && <input type="hidden" name="token" value={proof ?? ""} />}
      <button type="submit" disabled={token && !proof} className="ac-button">
        {pending ? t.common.loading : button}
      </button>
    </fieldset>
    {(shown || invalidLink) && <p role={successful ? "status" : "alert"} className={`ac-feedback${successful ? " ac-feedback--success" : ""}`}>
      {successful && <CircleCheck size={19} aria-hidden="true" />}{t.account.result[shown || "invalid"]}
    </p>}
    {invalidLink && <Link className="ac-text-link" href={recovery} prefetch={false}>{t.account.requestNewLink}<ArrowRight size={16} aria-hidden="true" /></Link>}
    {finished && <Link className="ac-text-link" href={done} prefetch={false}>{done === "/account/sign-in" ? t.account.signIn : t.account.title}<ArrowRight size={16} aria-hidden="true" /></Link>}
  </form></>;
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
