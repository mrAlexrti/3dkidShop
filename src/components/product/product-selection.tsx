"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { colorGallery, type ProductPhoto } from "@/lib/gallery";

const SelectionContext = createContext<{
  color: string; setColor: (id: string) => void; images: ProductPhoto[];
} | null>(null);

export function ProductSelectionProvider({ images, children }: { images: ProductPhoto[]; children: ReactNode }) {
  const [color, setColor] = useState("");
  const value = useMemo(() => ({ color, setColor, images: colorGallery(images, color) }), [color, images]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export const useProductSelection = () => useContext(SelectionContext);
