"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { storefrontImage, httpMediaUrl } from "@/lib/product-media";

// Keep Next optimization and native GIF handling; fail safely for empty/broken URLs.
export function ProductImage({ src, alt, onError, ...props }: ImageProps) {
  const [failed, setFailed] = useState<string | null>(null);
  // Hover animations are deliberately unoptimized browser requests and historically
  // allow any validated HTTP(S) source. Do not apply the optimizer host list to them.
  const url = typeof src === "string" ? props.unoptimized && httpMediaUrl.safeParse(src).success ? src : storefrontImage(src) : src;
  const displayed = typeof url === "string" && failed === url ? "/images/placeholder.svg" : url;
  return <Image {...props} alt={alt} src={displayed} onError={(event) => {
    if (typeof url === "string") setFailed(url);
    onError?.(event);
  }} />;
}
