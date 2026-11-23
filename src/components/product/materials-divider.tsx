"use client";
import * as React from "react";

import { useEffect, useRef, useState } from "react";
import { dividerCount } from "@/lib/product-materials";

export function MaterialsDivider({ motif }: { motif?: string | null }) {
  const root = useRef<HTMLDivElement>(null); const probe = useRef<HTMLSpanElement>(null); const spaced = useRef<HTMLSpanElement>(null);
  const [measurement, setMeasurement] = useState({ motif: "", count: 0 });
  const count = measurement.motif === motif ? measurement.count : 0;
  useEffect(() => {
    const node = root.current; if (!node || !motif) return;
    let frame = 0;
    const measure = () => { frame = 0; const next = dividerCount(node.clientWidth, probe.current?.getBoundingClientRect().width ?? 0, spaced.current?.getBoundingClientRect().width ?? 0); setMeasurement((previous) => previous.motif === motif && previous.count === next ? previous : { motif, count: next }); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    schedule();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(node); if (probe.current) observer?.observe(probe.current);
    window.addEventListener("resize", schedule);
    return () => { observer?.disconnect(); window.removeEventListener("resize", schedule); cancelAnimationFrame(frame); };
  }, [motif]);
  return <div ref={root} aria-hidden="true" data-materials-divider className="relative my-5 flex h-6 min-w-0 items-center justify-center overflow-hidden text-pink-500" dir="ltr">
    {motif && <><span ref={probe} className="invisible absolute whitespace-pre">{motif}</span><span ref={spaced} className="invisible absolute whitespace-pre">{motif}{"\u00a0\u00a0"}</span></>}
    {motif && count > 0 ? <span className="whitespace-pre">{Array(count).fill(motif).join("\u00a0\u00a0")}</span> : <span className="w-full border-t border-pink-100" />}
  </div>;
}
