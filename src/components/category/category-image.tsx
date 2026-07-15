"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";

export const DEFAULT_CATEGORY_IMAGE = "/images/placeholder.svg";

type CategoryImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
};

export function CategoryImage({ src, alt = "", onError, ...props }: CategoryImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  const resolvedSrc = !src || failed ? DEFAULT_CATEGORY_IMAGE : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={resolvedSrc}
      alt={alt}
      onError={(event) => {
        onError?.(event);
        if (resolvedSrc !== DEFAULT_CATEGORY_IMAGE) setFailed(true);
      }}
    />
  );
}
