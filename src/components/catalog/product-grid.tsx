"use client";

import { motion } from "framer-motion";
import { ProductCard } from "@/components/product/product-card";
import { staggerContainer } from "@/components/shared/animated-section";

type GridProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  oldPrice?: number | null;
  image: string;
  isNew?: boolean;
};

export function ProductGrid({ products }: { products: GridProduct[] }) {
  if (products.length === 0) {
    return <p className="py-16 text-center text-ink/50">Товары не найдены</p>;
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4"
    >
      {products.map((p) => (
        <ProductCard key={p.id} {...p} />
      ))}
    </motion.div>
  );
}
