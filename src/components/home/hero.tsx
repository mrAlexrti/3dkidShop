"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="container-shop pt-10 md:pt-16">
      <div className="relative overflow-hidden rounded-xl2 bg-white shadow-soft">
        <div className="grid items-center gap-8 px-6 py-12 md:grid-cols-2 md:px-14 md:py-20">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="glass-pink inline-block rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Новая коллекция
            </span>
            <h1 className="mt-5 font-display text-4xl leading-tight text-ink md:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-md text-ink/60 md:text-lg">{subtitle}</p>
            <div className="mt-8 flex gap-4">
              <Link href="/catalog">
                <Button size="lg">Смотреть каталог</Button>
              </Link>
              <Link href="/catalog?category=stickers">
                <Button size="lg" variant="outline">
                  Стикеры
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative aspect-square w-full overflow-hidden rounded-xl2"
          >
            <Image
              src="https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1200&q=80"
              alt="Подборка товаров STIKR"
              fill
              priority
              className="object-cover"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
