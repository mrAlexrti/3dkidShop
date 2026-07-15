"use client";

import { motion } from "framer-motion";
import { ProductCard } from "@/components/product/product-card";
import { staggerContainer } from "@/components/shared/animated-section";
import { useLangStore } from "@/store/lang-store";

type GridProduct = {
  id: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  price: number;
  oldPrice?: number | null;
  image: string;
  isNew?: boolean;
  hasOptions?: boolean;
  stock?: number;
};

export function ProductGrid({ products }: { products: GridProduct[] }) {
  const { t } = useLangStore();

  if (products.length === 0) {
    return <p className="py-16 text-center text-ink/50">{t.catalog.empty}</p>;
  }

  const productSetKey = products.map((product) => product.id).join(":");

  return (
    <motion.div
      key={productSetKey}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4"
    >
      {products.map((p) => (
        <ProductCard key={p.id} {...p} />
      ))}
    </motion.div>
  );
}
