"use client";

import Image from "next/image";
import { useState } from "react";

export function HeroImage({ src, fallback, alt, priority }: { src: string; fallback: string; alt: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <Image src={failed ? fallback : src} width={1254} height={1254} alt={alt} priority={priority}
    unoptimized={!failed && src !== fallback} onError={() => setFailed(true)}
    sizes="(max-width: 680px) 30vw, (max-width: 980px) 28vw, 280px" />;
}
