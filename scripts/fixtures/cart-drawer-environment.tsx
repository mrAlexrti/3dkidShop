// Local browser fixtures only. No Next server, providers, notifications or API calls.
import * as React from "react";

const listeners = new Set<() => void>();
export function navigate(path: string) {
  history.pushState(null, "", path);
  listeners.forEach((listener) => listener());
}
window.addEventListener("popstate", () => listeners.forEach((listener) => listener()));
export function usePathname() {
  return React.useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => location.pathname);
}
export const useRouter = () => ({ push: navigate });
export const messages: { kind: string; text: string }[] = [];
export const toast = Object.fromEntries(["success", "message", "error"].map((kind) => [kind, (text: string) => { messages.push({ kind, text }); }]));
export function Link({ href, onClick, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); navigate(href!); } }}>{children}</a>;
}
export function Image({ fill: _fill, sizes: _sizes, unoptimized: _unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) {
  void _fill; void _sizes; void _unoptimized;
  // Keep all image traffic inside the fixture origin.
  // eslint-disable-next-line @next/next/no-img-element -- Deliberate stub of Next Image in the isolated browser fixture.
  return <img {...props} src="/placeholder.svg" alt={props.alt ?? ""} />;
}
