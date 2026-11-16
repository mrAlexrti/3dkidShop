import * as React from "react";

export function ProductDescription({ text }: { text: string }) {
  return <div className="mt-5 space-y-4 break-words text-sm leading-relaxed text-ink/70">
    {text.split(/\r?\n[\t ]*\r?\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) =>
      <p key={index} className="whitespace-pre-line">{paragraph}</p>)}
  </div>;
}
