"use client";

import { ProductImage as Image } from "@/components/product/product-image";
import { useLangStore } from "@/store/lang-store";
import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { photoPosition, swipeDirection } from "@/lib/gallery";

export function ProductGallery({ images, name }: { images: { id: string; url: string; alt?: string | null }[]; name: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false); const [zoomed, setZoomed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const closeButton = useRef<HTMLButtonElement>(null); const id = useId();
  const touch = useRef<{ x: number; y: number } | null>(null); const suppressClickUntil = useRef(0);
  const list = images.length > 0 ? images : [{ id: "placeholder", url: "/images/placeholder.svg" }];

  const selected = list[active] ?? list[0];
  const { t } = useLangStore();
  const text = t.product.gallery; const index = Math.max(0, list.indexOf(selected));
  function move(direction: number) { setActive((current) => (current + direction + list.length) % list.length); setZoomed(false); }
  const swipe = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => { if (!zoomed && (event.pointerType === "touch" || event.pointerType === "pen")) touch.current = { x: event.clientX, y: event.clientY }; },
    onPointerCancel: () => { touch.current = null; },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const start = touch.current; touch.current = null; if (!start || list.length < 2) return;
      const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
      if (direction) { event.preventDefault(); move(direction); if (!open) suppressClickUntil.current = Date.now() + 500; }
    },
  };
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current; const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    element.showModal(); closeButton.current?.focus();
    return () => { if (element.open) element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open]);
  const arrows = (modal = false) => list.length > 1 && <>
    <button type="button" className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-soft" aria-label={text.previous} onClick={() => move(-1)}>‹</button>
    <button type="button" className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-soft" aria-label={text.next} onClick={() => move(1)}>›</button>
    {!modal && <span className="sr-only" aria-live="polite">{photoPosition(text.position, index, list.length)}</span>}
  </>;

  return (
    <div className="sf-product-gallery">
      <div className="relative aspect-square overflow-hidden rounded-xl2 bg-white shadow-soft" {...swipe} style={{ touchAction: "pan-y pinch-zoom" }}>
        <button type="button" className="absolute inset-0 h-full w-full" aria-haspopup="dialog" aria-label={`${text.open}: ${name}`} onClick={() => { if (Date.now() >= suppressClickUntil.current) { setZoomed(false); setOpen(true); } }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0"
          >
            <Image src={selected.url} alt={selected.alt || name} draggable={false} fill sizes="(max-width: 767px) 100vw, 50vw" priority className="object-cover" />
          </motion.div>
        </AnimatePresence>
        </button>
        {arrows()}
      </div>

      {list.length > 1 && (
        <div className="sf-gallery-thumbnails mt-4 flex gap-3 overflow-x-auto pb-2">
          {list.map((img, i) => (
            <button
              key={img.id}
              type="button" aria-pressed={selected.id === img.id} aria-label={`${t.product.viewImage} ${i + 1}: ${name}`}
              onClick={() => setActive(i)}
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                active === i ? "border-pink-500" : "border-transparent"
              )}
            >
              <Image src={img.url} alt={img.alt || `${name} ${i + 1}`} sizes="80px" fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
      <dialog ref={dialog} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} className="fixed max-h-[95dvh] w-[95vw] max-w-6xl overflow-auto rounded-xl bg-white p-3 text-ink shadow-2xl backdrop:bg-black/70"
        onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
        }}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${id}-title`} className="min-w-0 truncate font-semibold">{name}</h2>
          <button type="button" className="min-h-11 max-w-full shrink-0 rounded-full border px-3 text-sm" aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)}>{zoomed ? text.zoomOut : text.zoomIn}</button>
          <button ref={closeButton} type="button" className="min-h-11 max-w-full shrink-0 rounded-full border px-3 text-sm" onClick={() => setOpen(false)}>{text.close}</button>
        </div>
        <p id={`${id}-hint`} className="mb-2 text-xs text-ink/60">{text.hint}</p>
        <div className="relative">
          <div className="max-h-[72dvh] overflow-auto" {...swipe} style={{ touchAction: zoomed ? "auto" : "pan-y pinch-zoom" }} onDoubleClick={() => setZoomed((value) => !value)}>
            {open && <div style={{ width: zoomed ? "200%" : "100%" }}><Image src={selected.url} alt={selected.alt || name} width={1400} height={1400} sizes={zoomed ? "190vw" : "95vw"} draggable={false} className="h-auto w-full object-contain" /></div>}
          </div>
          {arrows(true)}
        </div>
        <p className="mt-2 text-center text-sm" aria-live="polite">{photoPosition(text.position, index, list.length)}</p>
      </dialog>
    </div>
  );
}
