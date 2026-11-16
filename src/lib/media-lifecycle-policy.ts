// No credentials or storage calls in this shared policy.
export const CLEANUP_QUEUE_PREFIX = "__product_media_cleanup_queue__:";
export const RETIRED_MEDIA_PREFIX = "__product_media_retired__:";
const managedPath = /^\/3dkid\/product-media\/(image|animation)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp|gif)$/;

export function managedMediaUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    const path = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) || !managedPath.test(path)) return null;
    // Query/fragment aliases still refer to the same storage object.
    return `https://${url.hostname}${path}`;
  } catch { return null; }
}

export function mediaReferences(values: (string | null | undefined)[], allowHttpAliases = false) {
  const reference = (value: string) => {
    if (!allowHttpAliases) return managedMediaUrl(value);
    try {
      const url = new URL(value);
      // Existing hover/manual URL support includes HTTP. Treat an HTTP alias as
      // a protective reference, while deletion candidates remain HTTPS-only.
      if (url.protocol === "http:") url.protocol = "https:";
      return managedMediaUrl(url.href);
    } catch { return null; }
  };
  const urls = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const direct = reference(value); if (direct) urls.add(direct);
    let text = value.replace(/\\\//g, "/");
    // Conservatively recognize encoded/JSON-escaped URLs in saved text too.
    for (let i = 0; i < 3; i++) text = text.replace(/%[0-9a-f]{2}/gi, (hex) => String.fromCharCode(parseInt(hex.slice(1), 16)));
    for (const match of text.matchAll(/https?:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com(?::443)?\/3dkid\/product-media\/(?:image|animation)\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)/gi)) {
      const url = reference(match[0]); if (url) urls.add(url);
    }
  }
  return [...urls];
}

export class RetiredMediaError extends Error {
  constructor() { super("MEDIA_RETIRED"); }
}
