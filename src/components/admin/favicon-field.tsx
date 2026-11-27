"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useLangStore } from "@/store/lang-store";
import { FAVICON_UPLOAD_LIMIT, FAVICON_WRITE_PATH } from "@/lib/favicon-config";
import { MEDIA_TYPES, UPLOAD_ERROR_CODES, type UploadErrorCode } from "@/lib/media-upload";

export function FaviconField({ revision, src, available, onPublish }: {
  revision: string | null;
  src: string;
  available: boolean;
  onPublish: (revision: string | null) => void;
}) {
  const { t } = useLangStore();
  const copy = t.seo.admin;
  const media = t.admin.media;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UploadErrorCode>();
  const [message, setMessage] = useState<"saved" | "restored">();

  async function save(file?: File) {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const response = await fetch(FAVICON_WRITE_PATH, file ? {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      } : { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setError(UPLOAD_ERROR_CODES.includes(data.error) ? data.error : "uploadFailed");
        return;
      }
      if (file ? !/^[a-f0-9]{32}$/.test(data.revision) : data.revision !== null) throw new Error("Invalid favicon response");
      onPublish(data.revision);
      setFile(undefined);
      if (input.current) input.current.value = "";
      setMessage(file ? "saved" : "restored");
    } catch {
      setError("uploadFailed");
    } finally {
      setBusy(false);
    }
  }

  return <section id="seo-favicon" aria-labelledby="seo-favicon-title" aria-busy={busy} className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
    <div className="flex items-center gap-3">
      <Image id="seo-favicon-preview" src={src} alt="" width={48} height={48} unoptimized />
      <div>
        <h3 id="seo-favicon-title" className="text-sm font-semibold">{copy.favicon}</h3>
        <p className="text-xs text-ink/60">{revision ? copy.faviconCustom : copy.faviconDefault}</p>
      </div>
    </div>
    <p id="seo-favicon-help" className="text-xs text-ink/70">{copy.faviconHelp}</p>
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} id="seo-favicon-file" type="file" hidden accept={MEDIA_TYPES.image.join(",")}
        disabled={!available || busy} onChange={event => {
          const selected = event.target.files?.[0];
          setMessage(undefined);
          setFile(undefined);
          if (!selected) { setError(undefined); return; }
          const invalid = selected.size > FAVICON_UPLOAD_LIMIT ? "tooLarge" :
            !(MEDIA_TYPES.image as readonly string[]).includes(selected.type) ? "unsupported" : undefined;
          setError(invalid);
          if (!invalid) setFile(selected);
          // Choosing the same file again still triggers a change event.
          event.target.value = "";
        }} />
      <button type="button" aria-controls="seo-favicon-file" aria-describedby="seo-favicon-help" disabled={!available || busy}
        className="min-h-11 rounded-full border border-ink/15 px-4 py-2 text-sm disabled:opacity-50"
        onClick={() => input.current?.click()}>{media.chooseFile}</button>
      <button id="seo-favicon-save" type="button" disabled={!available || !file || busy}
        className="min-h-11 rounded-full bg-pink-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        onClick={() => file && void save(file)}>{copy.faviconSave}</button>
      {revision && <button id="seo-favicon-reset" type="button" disabled={busy}
        className="min-h-11 px-2 text-sm underline disabled:opacity-50" onClick={() => void save()}>{copy.faviconReset}</button>}
    </div>
    {file && <p className="break-all text-xs text-ink/70">{file.name}</p>}
    {!available && <p className="text-xs text-ink/70">{media.uploadErrors.unavailable}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error === "invalidFile" ? copy.faviconInvalid : media.uploadErrors[error]}</p>}
    <p role="status" className="text-xs text-ink/70">{busy ? t.admin.common.saving :
      message === "saved" ? copy.faviconSaved : message === "restored" ? copy.faviconRestored : ""}</p>
  </section>;
}
