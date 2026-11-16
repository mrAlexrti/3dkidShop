"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { httpMediaUrl } from "@/lib/product-media";
import { useLangStore } from "@/store/lang-store";
import { inspectMediaFile, MEDIA_TYPES, uploadErrorCode, type UploadErrorCode } from "@/lib/media-upload";
import { mediaUploadsAvailable, uploadProductMedia } from "@/lib/media-upload-client";

export function MediaUrlField({ name, label, help, defaultValue = "", fallback, animated = false, required = false, disabled = false, uploadEnabled = false, onUploadStateChange }: {
  name: string;
  label: string;
  help: string;
  defaultValue?: string;
  fallback?: string;
  animated?: boolean;
  required?: boolean;
  disabled?: boolean;
  uploadEnabled?: boolean;
  onUploadStateChange?: (name: string, busy: boolean) => void;
}) {
  const { t, locale } = useLangStore();
  const text = t.admin.media;
  const [value, setValue] = useState(defaultValue);
  const [failedUrl, setFailedUrl] = useState("");
  const [availability, setAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const [selected, setSelected] = useState<File | null>(null);
  const [fileReady, setFileReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<UploadErrorCode | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const selection = useRef(0);
  const notify = useRef(onUploadStateChange);
  useEffect(() => { notify.current = onUploadStateChange; }, [onUploadStateChange]);
  useEffect(() => {
    if (!uploadEnabled) return;
    const check = new AbortController();
    const selectionState = selection;
    void mediaUploadsAvailable(check.signal).then((available) => { if (!check.signal.aborted) setAvailability(available ? "available" : "unavailable"); });
    return () => { check.abort(); controller.current?.abort(); selectionState.current++; if (active.current) notify.current?.(name, false); };
  }, [name, uploadEnabled]);
  const kind = animated ? "animation" : "image";
  const fileSize = selected && new Intl.NumberFormat(locale === "ua" ? "uk-UA" : "en-US", { maximumFractionDigits: 2 }).format(
    selected.size < 1000 ? selected.size : selected.size < 1_000_000 ? selected.size / 1000 : selected.size / 1_000_000
  ) + (selected && selected.size < 1000 ? " B" : selected && selected.size < 1_000_000 ? " kB" : " MB");
  async function selectFile(file: File | null) {
    const version = ++selection.current;
    setSelected(file); setFileReady(false); setError(null); setUploaded(false);
    if (!file) return;
    try { await inspectMediaFile(file, kind); if (selection.current === version) setFileReady(true); }
    catch (failure) { if (selection.current === version) setError(uploadErrorCode(failure)); }
  }
  async function startUpload() {
    if (!uploadEnabled || active.current || !selected || !fileReady || disabled || availability !== "available") return;
    active.current = true; notify.current?.(name, true); setBusy(true); setProgress(0); setError(null); setUploaded(false);
    const request = new AbortController(); controller.current = request;
    try {
      const url = await uploadProductMedia(selected, kind, (percent) => { if (!request.signal.aborted) setProgress(percent); }, request.signal);
      if (request.signal.aborted) return;
      setValue(url); setFailedUrl(""); setUploaded(true); setFileReady(false);
      urlInput.current?.setCustomValidity("");
    } catch (failure) { if (!request.signal.aborted) setError(uploadErrorCode(failure)); }
    finally {
      active.current = false; notify.current?.(name, false);
      if (!request.signal.aborted) setBusy(false);
    }
  }
  const trimmed = value.trim();
  const valid = httpMediaUrl.safeParse(trimmed).success;
  const preview = valid ? trimmed : !trimmed ? fallback : undefined;
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>
      <input ref={urlInput} id={name} name={name} type="url" required={required} disabled={disabled || busy} value={value} onChange={(event) => {
        setValue(event.target.value);
        setUploaded(false);
        event.target.setCustomValidity(event.target.value.trim() && !httpMediaUrl.safeParse(event.target.value).success ? t.admin.media.invalidUrl : "");
      }} onBlur={(event) => event.target.setCustomValidity(trimmed && !valid ? t.admin.media.invalidUrl : "")}
        aria-describedby={`${name}-help`} placeholder="https://…"
        className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400" />
      <p id={`${name}-help`} className="mt-2 text-xs leading-relaxed text-ink/60">{help}</p>
      {uploadEnabled && <><div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={fileInput} id={`${name}-file`} type="file" hidden accept={MEDIA_TYPES[kind].join(",")} disabled={disabled || busy || availability !== "available"}
          onChange={(event) => { void selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        <button type="button" aria-label={`${text.chooseFile}: ${label}`} aria-controls={`${name}-file`} aria-describedby={`${name}-upload-help`} disabled={disabled || busy || availability !== "available"}
          className="min-h-11 rounded-full border border-ink/15 px-4 py-2 text-sm disabled:opacity-50" onClick={() => fileInput.current?.click()}>{text.chooseFile}</button>
        <button type="button" aria-label={`${busy ? text.uploading : text.upload}: ${label}`} disabled={disabled || busy || !fileReady || availability !== "available"}
          className="min-h-11 rounded-full bg-pink-500 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => void startUpload()}>{busy ? text.uploading : text.upload}</button>
      </div>
      <p id={`${name}-upload-help`} className="mt-2 text-xs text-ink/60">{animated ? text.animationLimit : text.imageLimit}</p>
      {selected && <p className="mt-2 break-all text-xs text-ink/70">{selected.name} · {fileSize}</p>}
      {busy && <progress className="mt-2 w-full" aria-label={`${text.uploading}: ${label}`} max={100} value={progress} />}
      <div aria-live="polite" className="mt-2 text-xs text-ink/60">
        {availability === "checking" && <p>{text.checking}</p>}
        {availability === "unavailable" && <p>{text.uploadErrors.unavailable}</p>}
        {error && <p role="alert">{text.uploadErrors[error]}</p>}
        {uploaded && <p>{text.uploaded}</p>}
      </div></>}
      {value && <button type="button" aria-label={`${text.clear}: ${label}`} disabled={disabled || busy} className="mt-2 min-h-11 text-sm underline disabled:opacity-50" onClick={() => {
        setValue("");
        setUploaded(false); setFailedUrl("");
        urlInput.current?.setCustomValidity("");
      }}>{t.admin.media.clear}</button>}
      {preview && preview !== failedUrl && <Image key={preview} src={preview} width={200} height={200} unoptimized
        className={`mt-3 aspect-square rounded-xl object-cover${animated ? " motion-reduce:hidden" : ""}`} alt={`${t.admin.common.preview}: ${label}`} onError={() => setFailedUrl(preview)} />}
      {preview && preview === failedUrl && <p role="status" className="mt-2 text-xs text-ink/60">{t.admin.media.previewError}</p>}
    </div>
  );
}
