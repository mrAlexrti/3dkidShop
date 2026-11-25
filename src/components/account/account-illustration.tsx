"use client";

import Image, { getImageProps } from "next/image";
import { useState } from "react";

const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function AccountIllustration({ src, fallback, unoptimized, auth = false }: {
  src: string; fallback: string; unoptimized: boolean; auth?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  const image = failed === src ? fallback : src;
  // URLs outside the optimizer allowlist are loaded by the browser, as in the Site Content hero.
  const direct = image === src && unoptimized;
  const onError = () => setFailed(src);

  if (auth) {
    const { props } = getImageProps({ src: image, alt: "", width: 360, height: 360,
      sizes: "(min-width: 840px) 300px, calc(46vw - 70px)", unoptimized: direct });
    // Only a matching media source can request the decorative asset.
    return <picture>
      <source media="(min-width: 681px)" sizes={props.sizes} srcSet={props.srcSet ?? props.src} />
      <Image src={transparentPixel} alt="" width={360} height={360} unoptimized onError={onError} />
    </picture>;
  }

  return <Image src={image} alt="" width={160} height={160} sizes="(min-width: 1108px) 144px, (min-width: 600px) 13vw, 78px"
    unoptimized={direct} onError={onError} />;
}
