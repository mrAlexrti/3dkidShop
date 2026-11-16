"use client";

import { useEffect, useRef, useState } from "react";
import { MediaUrlField } from "@/components/admin/media-url-field";
import { AdminFieldError, useAdminForm } from "@/components/admin/admin-form";
import { useLangStore } from "@/store/lang-store";
import { MAX_PRODUCT_IMAGES, gallerySnapshot, type ProductPhoto } from "@/lib/gallery";
import { inspectMediaFile, uploadErrorCode, type UploadErrorCode } from "@/lib/media-upload";
import { mediaUploadsAvailable, uploadProductMedia } from "@/lib/media-upload-client";

type Draft = { key: string; id?: string; url: string; alt: string };
export function GalleryEditor({ images, imageUrl = "" }: { images?: ProductPhoto[]; imageUrl?: string }) {
  const { t } = useLangStore(); const text = t.admin.gallery; const form = useAdminForm();
  const [photos, setPhotos] = useState<Draft[]>(() => images?.length ? images.map((image) => ({ ...image, key: image.id, alt: image.alt ?? "" })) : [{ key: "new-0", url: imageUrl, alt: "" }]);
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0);
  const [available, setAvailable] = useState(false); const [error, setError] = useState<UploadErrorCode | "galleryLimit" | null>(null);
  const picker = useRef<HTMLInputElement>(null); const active = useRef(false); const request = useRef<AbortController | null>(null);
  const original = useRef(gallerySnapshot(images ?? []));
  const register = form.uploadStateChanged;
  useEffect(() => {
    const check = new AbortController(); void mediaUploadsAvailable(check.signal).then((value) => { if (!check.signal.aborted) setAvailable(value); });
    return () => { check.abort(); request.current?.abort(); if (active.current) register("gallery-batch", false); };
  }, [register]);
  const locked = busy || form.pending || form.uploading;
  function move(index: number, target: number) {
    setPhotos((current) => { const next = [...current]; const [photo] = next.splice(index, 1); next.splice(target, 0, photo); return next; });
  }
  async function upload() {
    if (active.current || !files.length || !available || locked) return;
    // A single blank starter row can be replaced by the first uploaded file.
    const existing = photos.filter((photo) => photo.id || photo.url.trim() || photo.alt.trim());
    if (existing.length + files.length > MAX_PRODUCT_IMAGES) { setError("galleryLimit"); return; }
    active.current = true; setBusy(true); register("gallery-batch", true); setError(null); setProgress(0);
    const controller = new AbortController(); request.current = controller;
    try {
      for (const file of files) await inspectMediaFile(file, "image");
      setPhotos(existing);
      for (const [index, file] of files.entries()) {
        const url = await uploadProductMedia(file, "image", (percent) => { if (!controller.signal.aborted) setProgress((index * 100 + percent) / files.length); }, controller.signal);
        if (controller.signal.aborted) return;
        setPhotos((current) => [...current, { key: crypto.randomUUID(), url, alt: "" }]);
        // Successful URLs survive a later upload/validation/network failure.
        setFiles((current) => current.slice(1));
      }
    } catch (failure) { if (!controller.signal.aborted) setError(uploadErrorCode(failure)); }
    finally { active.current = false; register("gallery-batch", false); if (!controller.signal.aborted) setBusy(false); }
  }
  return <fieldset data-field-name="images" tabIndex={-1} className="min-w-0 space-y-4 rounded-xl border border-ink/10 p-4">
    <legend className="px-2 font-semibold">{text.title}</legend>
    <p className="text-xs text-ink/60">{text.limit}</p><AdminFieldError name="images" />
    <input type="hidden" name="images" value={JSON.stringify(photos.map(({ id, url, alt }) => ({ id, url, alt })))} />
    <input type="hidden" name="imagesSnapshot" value={original.current} />
    {photos.map((photo, index) => <div key={photo.key} className="space-y-2 rounded-xl border border-ink/10 p-3">
      <p className="text-sm font-semibold">{text.photo} {index + 1}{index === 0 ? ` · ${text.primary}` : ""}</p>
      <MediaUrlField name={index === 0 ? "imageUrl" : `gallery-${photo.key}`} label={`${text.photo} ${index + 1}`} help={t.admin.media.imageHelp} value={photo.url}
        onValueChange={(url) => setPhotos((current) => current.map((image) => image.key === photo.key ? { ...image, url } : image))} uploadEnabled required disabled={busy || form.pending} />
      <label className="block text-xs">{text.alt}<input className="mt-1 w-full rounded-lg border border-ink/10 p-2 text-sm" maxLength={300} value={photo.alt} disabled={locked}
        onChange={(event) => setPhotos((current) => current.map((image) => image.key === photo.key ? { ...image, alt: event.target.value } : image))} /></label>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="min-h-11 rounded-full border px-3" disabled={locked || index === 0} onClick={() => move(index, 0)} aria-label={`${text.makePrimary}: ${index + 1}`}>{text.makePrimary}</button>
        <button type="button" className="min-h-11 rounded-full border px-3" disabled={locked || index === 0} onClick={() => move(index, index - 1)} aria-label={`${text.up}: ${index + 1}`}>↑</button>
        <button type="button" className="min-h-11 rounded-full border px-3" disabled={locked || index === photos.length - 1} onClick={() => move(index, index + 1)} aria-label={`${text.down}: ${index + 1}`}>↓</button>
        <button type="button" className="min-h-11 rounded-full border px-3" disabled={locked || photos.length <= 1} onClick={() => setPhotos((current) => current.filter((image) => image.key !== photo.key))} aria-label={`${text.remove}: ${index + 1}`}>{text.remove}</button>
      </div>
    </div>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded-full border px-4 text-sm" disabled={locked || photos.length >= MAX_PRODUCT_IMAGES} onClick={() => setPhotos((current) => [...current, { key: crypto.randomUUID(), url: "", alt: "" }])}>{text.add}</button>
      <input ref={picker} type="file" multiple hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => {
        const selected = Array.from(event.target.files ?? []); event.target.value = "";
        if (selected.length > MAX_PRODUCT_IMAGES) { setError("galleryLimit"); return; }
        setFiles(selected); setError(null);
      }} />
      <button type="button" className="min-h-11 rounded-full border px-4 text-sm" disabled={locked || !available} onClick={() => picker.current?.click()}>{text.choose}</button>
      <button type="button" className="min-h-11 rounded-full bg-pink-500 px-4 text-sm text-white disabled:opacity-40" disabled={locked || !files.length || !available} onClick={() => void upload()}>{text.upload}</button>
    </div>
    {files.length > 0 && <ul className="break-all text-xs">{files.map((file, index) => <li key={index}>{file.name} · {file.size.toLocaleString()} B</li>)}</ul>}
    {busy && <progress aria-label={t.admin.media.uploading} value={progress} max={100} className="w-full" />}
    {error && <p role="alert" className="text-sm text-red-700">{error === "galleryLimit" ? t.admin.validation.galleryLimit : t.admin.media.uploadErrors[error]}</p>}
  </fieldset>;
}
