"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useLangStore } from "@/store/lang-store";
import type { AccountResult } from "@/lib/customer/actions";
import { AccountField } from "./account-form";

export function AccountEmailRequest({ mode, action, children }: {
  mode: "register" | "reset"; action: (data: FormData) => Promise<AccountResult>; children?: ReactNode;
}) {
  const { t } = useLangStore();
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<AccountResult | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const deadline = useRef(0);
  const lastAddress = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { if (sent) heading.current?.focus(); }, [sent]);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  async function request(email: string) {
    if (inFlight.current || (email.toLowerCase() === lastAddress.current && Date.now() < deadline.current)) {
      if (!inFlight.current) setSent(true);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    const data = new FormData();
    data.set("email", email);
    try {
      const result = await action(data);
      if (result === "sent") {
        lastAddress.current = email.toLowerCase();
        deadline.current = Date.now() + 60_000;
        setAddress(email);
        setSeconds(60);
        setSent(true);
      } else setError(result);
    } catch {
      setError("failed");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    void request(email);
  }

  const feedback = error && <p className="ac-feedback" role="alert">{t.account.result[error]}</p>;
  if (sent) return <section className="ac-auth-state" aria-busy={pending}>
    <MailCheck size={34} aria-hidden="true" />
    <h2 ref={heading} tabIndex={-1} className="ac-status-heading">{t.account.checkEmail}</h2>
    <strong className="ac-sent-address">{address}</strong>
    <p role="status">{t.account.result.sent}</p>
    <p>{t.account.requestNext[mode]}</p>
    <p>{t.account.requestSpam}</p>
    {feedback}
    <div className="ac-auth-state-actions">
      <button className="ac-button" type="button" disabled={pending || seconds > 0} onClick={() => void request(address)}>
        {pending ? t.common.loading : seconds ? t.account.resendWait(seconds) : t.account.resendLink}
      </button>
      <button className="ac-text-link" type="button" disabled={pending} onClick={() => { setSent(false); setError(null); }}>
        {t.account.changeRequestAddress}
      </button>
      <Link className="ac-text-link" href="/account/sign-in" prefetch={false}>{t.account.backToSignIn}</Link>
    </div>
  </section>;

  return <>
    <form method="post" className="ac-form" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={!ready || pending}>
        <AccountField label={t.account.email} name="email" type="email" autoComplete="email" maxLength={254} defaultValue={address} />
        <button className="ac-button" type="submit">{pending ? t.common.loading : t.account.sendLink}</button>
      </fieldset>
      {feedback}
    </form>
    {children}
  </>;
}
