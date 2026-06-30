"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function ProductGallery({ images, name }: { images: { id: string; url: string }[]; name: string }) {
  const [active, setActive] = useState(0);
  const list = images.length > 0 ? images : [{ id: "placeholder", url: "/images/placeholder.svg" }];

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl2 bg-white shadow-soft">
        <AnimatePresence mode="wait">
          <motion.div
            key={list[active].id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0"
          >
            <Image src={list[active].url} alt={name} fill priority className="object-cover" />
          </motion.div>
        </AnimatePresence>
      </div>

      {list.length > 1 && (
        <div className="mt-4 flex gap-3">
          {list.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActive(i)}
              className={cn(
                "relative h-20 w-20 overflow-hidden rounded-lg border-2 transition-colors",
                active === i ? "border-pink-500" : "border-transparent"
              )}
            >
              <Image src={img.url} alt={`${name} ${i + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
