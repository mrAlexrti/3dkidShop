type Entry = { notify: (active: boolean) => void; visible: boolean };
const entries = new Map<HTMLElement, Entry>();
let observer: IntersectionObserver | null = null;
let dispose: (() => void) | null = null;

function startObserver() {
  const touch = window.matchMedia("(hover: none) and (pointer: coarse)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const network = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean; effectiveType?: string } }).connection;
  const allowed = () => touch.matches && !reduced.matches && !document.hidden &&
    !network?.saveData && !["slow-2g", "2g"].includes(network?.effectiveType ?? "");
  const update = () => {
    const enabled = allowed();
    for (const entry of entries.values()) entry.notify(enabled && entry.visible);
  };
  observer = new IntersectionObserver((changes) => {
    const enabled = allowed();
    for (const change of changes) {
      const entry = entries.get(change.target as HTMLElement);
      if (!entry) continue;
      entry.visible = change.intersectionRatio >= 0.6;
      entry.notify(enabled && entry.visible);
    }
  }, { threshold: [0, 0.6] });
  document.addEventListener("visibilitychange", update);
  touch.addEventListener("change", update);
  reduced.addEventListener("change", update);
  network?.addEventListener("change", update);
  dispose = () => {
    observer?.disconnect();
    observer = null;
    document.removeEventListener("visibilitychange", update);
    touch.removeEventListener("change", update);
    reduced.removeEventListener("change", update);
    network?.removeEventListener("change", update);
    dispose = null;
  };
}

export function registerMobileAnimation(node: HTMLElement, notify: (active: boolean) => void) {
  if (typeof IntersectionObserver === "undefined") return;
  entries.set(node, { notify, visible: false });
  if (!observer) startObserver();
  observer?.observe(node);
  return () => {
    observer?.unobserve(node);
    entries.delete(node);
    if (entries.size === 0) dispose?.();
  };
}
