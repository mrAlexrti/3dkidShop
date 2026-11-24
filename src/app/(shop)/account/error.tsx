"use client";
import { useLangStore } from "@/store/lang-store";
import { CircleAlert } from "lucide-react";

export default function AccountError({ reset }: { reset: () => void }) {
  const { t } = useLangStore();
  return <div className="ac-state ac-panel" role="alert"><CircleAlert size={24} aria-hidden="true" /><p>{t.account.result.failed}</p><button type="button" className="ac-button ac-button--soft" onClick={reset}>{t.account.tryAgain}</button></div>;
}
