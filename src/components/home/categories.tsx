"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatedSection } from "@/components/shared/animated-section";
import { useLangStore } from "@/store/lang-store";

type Category = { id: string; name: string; slug: string; imageUrl: string | null };

function CategoryCard({ c, i }: { c: Category; i: number }) {
  const [err, setErr] = useState(false);
  const showImg = !!c.imageUrl && !err;

  return (
    <AnimatedSection delay={i * 0.06}>
      <Link
        href={`/catalog?category=${c.slug}`}
        className="group flex w-24 flex-col items-center gap-3 md:w-32"
      >
        <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-[28px] border-2 border-pink-100 bg-white shadow-soft transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-pink-200 group-hover:shadow-glass md:h-32 md:w-32">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.imageUrl!}
              alt={c.name}
              className="h-full w-full object-cover"
              onError={() => setErr(true)}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-pink-100 to-pink-200">
              <span className="font-display text-3xl text-pink-500 md:text-4xl">
                {c.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <span className="text-center font-display text-sm text-ink transition-colors group-hover:text-pink-600 md:text-base">
          {c.name}
        </span>
      </Link>
    </AnimatedSection>
  );
}

export function Categories({ categories }: { categories: Category[] }) {
  const { t } = useLangStore();

  return (
    <section className="container-shop mt-10 md:mt-16">
      <AnimatedSection className="text-center">
        <h2 className="font-display text-3xl text-ink md:text-4xl">{t.home.categories}</h2>
        <p className="mt-2 text-ink/60">{t.home.categoriesDesc}</p>
      </AnimatedSection>

      <div className="mt-8 flex flex-wrap justify-center gap-5 md:mt-10 md:gap-8">
        {categories.map((c, i) => (
          <CategoryCard key={c.id} c={c} i={i} />
        ))}
      </div>
    </section>
  );
}
