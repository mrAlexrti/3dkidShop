"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import type { AdminFieldError as FieldErrorCode, AdminFormResult } from "@/lib/admin-form-validation";

const FormContext = createContext({ errors: {} as Record<string, FieldErrorCode>, pending: false, uploading: false, ready: false, id: "admin-form",
  uploadStateChanged: (_name: string, _busy: boolean) => { void _name; void _busy; } });
export const useAdminForm = () => useContext(FormContext);

export function AdminFieldError({ name }: { name: string }) {
  const { errors, id } = useAdminForm(); const { t } = useLangStore();
  return errors[name] ? <p id={`${id}-${name}-error`} role="alert" className="mt-1 text-sm text-red-700">{t.admin.validation[errors[name]]}</p> : null;
}

export function AdminSaveButton({ children, className, size }: { children?: ReactNode; className?: string; size?: "sm" | "lg" | "md" }) {
  const { pending, uploading, ready } = useAdminForm(); const { t } = useLangStore();
  return <Button type="submit" size={size} className={className} disabled={!ready || pending || uploading}>{pending ? t.admin.common.saving : children ?? t.admin.common.save}</Button>;
}

export function AdminForm({ action, successHref, children, className }: {
  action: (data: FormData) => Promise<AdminFormResult>; successHref?: string; children: ReactNode; className?: string;
}) {
  const { t } = useLangStore(); const router = useRouter(); const id = useId();
  const [pending, startTransition] = useTransition(); const [errors, setErrors] = useState<Record<string, FieldErrorCode>>({});
  const [failure, setFailure] = useState<"saveFailed" | "notFound" | "mediaRetired" | null>(null);
  const [uploading, setUploading] = useState(false); const uploads = useRef(new Set<string>()); const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const formRef = useRef<HTMLFormElement>(null);
  const uploadStateChanged = useCallback((name: string, busy: boolean) => {
    if (busy) uploads.current.add(name); else uploads.current.delete(name);
    setUploading(uploads.current.size > 0);
  }, []);
  function showErrors(fields: Record<string, FieldErrorCode>) {
    setErrors(fields);
    // Attribute updates are scoped to this form. Values/defaults are never reset.
    const form = formRef.current; if (!form) return;
    for (const control of Array.from(form.querySelectorAll<HTMLElement>("[name], [data-field-name]"))) {
      const name = control.getAttribute("name") || control.dataset.fieldName || "";
      const described = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((value) => value && value !== `${id}-${name}-error`);
      if (fields[name]) { control.setAttribute("aria-invalid", "true"); described.push(`${id}-${name}-error`); }
      else control.removeAttribute("aria-invalid");
      if (described.length) control.setAttribute("aria-describedby", described.join(" ")); else control.removeAttribute("aria-describedby");
    }
    const first = Object.keys(fields)[0];
    const target = Array.from(form.querySelectorAll<HTMLElement>("[name], [data-field-name]")).find((node) =>
      (node.getAttribute("name") === first && node.getAttribute("type") !== "hidden") || node.dataset.fieldName === first);
    target?.focus(); target?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting.current || uploads.current.size) return;
    const form = event.currentTarget; const fields: Record<string, FieldErrorCode> = {};
    for (const control of Array.from(form.elements)) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.willValidate || control.validity.valid) continue;
      const name = control.name || control.closest<HTMLElement>("[data-field-name]")?.dataset.fieldName;
      if (name) fields[name] = control.validity.valueMissing ? "required" : "invalid";
    }
    setFailure(null); showErrors(fields); if (Object.keys(fields).length) return;
    const data = new FormData(form); submitting.current = true;
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result?.error) {
          if (result.error === "slugInvalid" || result.error === "slugDuplicate") showErrors({ slug: result.error });
          else if (result.error === "validation") showErrors(result.fieldErrors ?? { form: "invalid" });
          else setFailure(result.error);
          return;
        }
        toast.success(t.admin.common.saved);
        if (successHref) router.push(successHref); else router.refresh();
      } catch { setFailure("saveFailed"); }
      finally { submitting.current = false; }
    });
  }
  return <FormContext.Provider value={{ errors, pending, uploading, ready, id, uploadStateChanged }}>
    <form ref={formRef} method="post" noValidate onSubmit={submit} className={`${className ?? ""} [&_[aria-invalid=true]]:border-red-500 [&_[aria-invalid=true]]:ring-1 [&_[aria-invalid=true]]:ring-red-200`}>
      {Object.keys(errors).length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t.admin.validation.summary} ({Object.keys(errors).length})</div>}
      {failure && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{failure === "mediaRetired" ? t.admin.media.retired : t.admin.validation[failure]}</p>}
      {children}
    </form>
  </FormContext.Provider>;
}
