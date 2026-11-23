"use client";
import * as React from "react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLangStore } from "@/store/lang-store";

export function ConfirmButton({ children, message, onConfirm, actionLabel, disabled, className, label, title, renderTrigger }: {
  children?: ReactNode; message: string; onConfirm: () => void | Promise<void>; actionLabel?: string;
  disabled?: boolean; className?: string; label?: string; title?: string;
  renderTrigger?: (open: () => void) => ReactNode;
}) {
  const { t } = useLangStore(); const text = t.adminSafety;
  const [open, setOpen] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const cancel = useRef<HTMLButtonElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const busy = useRef(false); const id = useId();
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current; const overflow = document.body.style.overflow; const previous = trigger.current ?? document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden"; node.showModal(); cancel.current?.focus();
    return () => { if (node.open) node.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open]);
  function close() { if (!busy.current) setOpen(false); }
  function request() { if (!busy.current && !disabled) { setError(false); setOpen(true); } }
  return <>{renderTrigger ? renderTrigger(request) : <button ref={trigger} type="button" disabled={disabled || pending} className={className} aria-label={label} title={title}
    onClick={request}>{children}</button>}
    {open && createPortal(<dialog ref={dialog} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); close(); }} onClose={close}
      onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-pink-100 bg-white p-6 text-ink shadow-xl backdrop:bg-black/40">
      <h2 id={id} className="break-words font-semibold">{message}</h2>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{t.admin.common.deleteFailed}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3"><button ref={cancel} type="button" disabled={pending} onClick={close} className="min-h-11 rounded-full border px-5">{text.cancel}</button>
        <button type="button" disabled={pending} className="min-h-11 rounded-full bg-red-700 px-5 text-white disabled:opacity-50" onClick={async () => {
          if (busy.current || disabled) return; busy.current = true; setPending(true);
          try { await onConfirm(); setOpen(false); } catch { setError(true); }
          finally { busy.current = false; setPending(false); }
        }}>{actionLabel ?? text.delete}</button></div>
    </dialog>, document.body)}
  </>;
}

// Record names remain plain React text; never HTML.
export function namedConfirmation(template: string, name: string) { return template.replace("{name}", name); }

export function EditorRemoveButton({ persisted, retiring = false, name, children, onConfirm, disabled, label, className }: {
  persisted: boolean; retiring?: boolean; name: string; children: ReactNode; onConfirm: () => void; disabled?: boolean; label?: string; className?: string;
}) {
  const { t } = useLangStore();
  if (!persisted) return <button type="button" disabled={disabled} aria-label={label} className={className} onClick={onConfirm}>{children}</button>;
  return <ConfirmButton disabled={disabled} label={label} className={className} onConfirm={onConfirm}
    message={namedConfirmation(retiring ? t.adminSafety.retire : t.adminSafety.savedRemoval, name)} actionLabel={retiring ? String(children) : t.adminSafety.delete}>{children}</ConfirmButton>;
}
