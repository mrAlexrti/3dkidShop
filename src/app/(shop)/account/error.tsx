"use client";
import { useLangStore } from "@/store/lang-store";

export default function AccountError({ reset }: { reset: () => void }) {
  const { t } = useLangStore();
  return <div role="alert"><p>{t.account.result.failed}</p><button className="min-h-11 text-pink-700 underline" onClick={reset}>{t.account.tryAgain}</button></div>;
}
