import Link from "next/link";
import Image from "next/image";
import { AnimatedSection } from "@/components/shared/animated-section";

type Category = { id: string; name: string; slug: string; imageUrl: string | null };

export function Categories({ categories }: { categories: Category[] }) {
  return (
    <section className="container-shop mt-24">
      <AnimatedSection>
        <h2 className="font-display text-3xl text-ink">Категории</h2>
        <p className="mt-2 text-ink/60">Найдите то, что поднимет настроение</p>
      </AnimatedSection>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {categories.map((c, i) => (
          <AnimatedSection key={c.id} delay={i * 0.08}>
            <Link
              href={`/catalog?category=${c.slug}`}
              className="group relative block aspect-square overflow-hidden rounded-xl2 shadow-soft"
            >
              {c.imageUrl && (
                <Image
                  src={c.imageUrl}
                  alt={c.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 font-display text-xl text-white">
                {c.name}
              </span>
            </Link>
          </AnimatedSection>
        ))}
      </div>
    </section>
  );
}
