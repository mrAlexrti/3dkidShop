// One lazy, shared coordinator for reusable cards across the document. No polling.
export type AnimationCandidate = { id: object; ratio: number; distance: number };
export function preferredAnimation(candidates: AnimationCandidate[], current: object | null, viewport: number) {
  const eligible = candidates.filter((item) => item.ratio >= .6).sort((a, b) => a.distance - b.distance);
  const best = eligible[0]; if (!best) return null;
  const previous = eligible.find((item) => item.id === current);
  return previous && previous.distance - best.distance < Math.max(24, viewport * .08) ? previous.id : best.id;
}
export function visibleAnimationCandidate(node: HTMLElement, viewportHeight: number, viewportWidth: number): AnimationCandidate {
  const rect = node.getBoundingClientRect();
  const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(0, rect.top));
  const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(0, rect.left));
  // A card taller than the viewport can qualify without impossible 60% coverage.
  const area = Math.min(rect.height, viewportHeight) * Math.min(rect.width, viewportWidth);
  return { id: node, ratio: area > 0 ? height * width / area : 0, distance: Math.abs(rect.top + rect.height / 2 - viewportHeight / 2) };
}

type Entry = { notify: (active: boolean) => void; visible: boolean };
const entries = new Map<HTMLElement, Entry>();
let current: HTMLElement | null = null, pending: HTMLElement | null = null;
let frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
let observer: IntersectionObserver | null = null, dispose: (() => void) | null = null;
function commit(node: HTMLElement | null) {
  if (node === current) return;
  const previous = current; current = node;
  if (previous) entries.get(previous)?.notify(false);
  if (current) entries.get(current)?.notify(true);
}
function stopPending() { clearTimeout(timer); timer = undefined; pending = null; }
function startCoordinator() {
  if (dispose || typeof IntersectionObserver === "undefined") return;
  const touch = window.matchMedia("(hover: none) and (pointer: coarse)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const network = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean; effectiveType?: string } }).connection;
  const allowed = () => touch.matches && !reduced.matches && !document.hidden && !network?.saveData && !["slow-2g", "2g"].includes(network?.effectiveType ?? "");
  function best() {
    if (!allowed()) return null;
    return preferredAnimation([...entries].filter(([, entry]) => entry.visible).map(([node]) => visibleAnimationCandidate(node, window.innerHeight, window.innerWidth)), current, window.innerHeight) as HTMLElement | null;
  }
  function evaluate() {
    frame = 0;
    const target = best();
    if (!target) { stopPending(); commit(null); return; }
    if (target === current) { stopPending(); return; }
    if (pending === target) return;
    stopPending(); pending = target;
    timer = setTimeout(() => {
      const next = best(); stopPending();
      if (next === target) commit(next); else schedule();
    }, 120);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(evaluate); }
  observer = new IntersectionObserver((changes) => {
    for (const change of changes) { const entry = entries.get(change.target as HTMLElement); if (entry) entry.visible = change.isIntersecting; }
    schedule();
  }, { threshold: [0, .15, .3, .45, .6, .75, .9, 1] });
  for (const node of entries.keys()) observer.observe(node);
  window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
  const preference = () => { if (!allowed()) { stopPending(); commit(null); } schedule(); };
  document.addEventListener("visibilitychange", preference); touch.addEventListener("change", preference); reduced.addEventListener("change", preference);
  network?.addEventListener("change", preference);
  dispose = () => {
    observer?.disconnect(); observer = null; cancelAnimationFrame(frame); frame = 0; stopPending();
    window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
    document.removeEventListener("visibilitychange", preference); touch.removeEventListener("change", preference); reduced.removeEventListener("change", preference); network?.removeEventListener("change", preference);
    commit(null); dispose = null;
  };
}
export function registerMobileAnimation(node: HTMLElement, notify: (active: boolean) => void) {
  entries.set(node, { notify, visible: false });
  if (dispose) observer?.observe(node); else startCoordinator();
  return () => {
    if (current === node) commit(null);
    entries.delete(node); observer?.unobserve(node);
    if (!entries.size) dispose?.();
    else window.dispatchEvent(new Event("scroll"));
  };
}
