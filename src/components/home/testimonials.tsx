import { Star } from "lucide-react";
import { AnimatedSection } from "@/components/shared/animated-section";

type Review = { id: string; author: string; rating: number; text: string };

export function Testimonials({ reviews }: { reviews: Review[] }) {
  return (
    <section className="container-shop mt-24">
      <AnimatedSection>
        <h2 className="font-display text-3xl text-ink">Отзывы клиентов</h2>
      </AnimatedSection>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {reviews.map((r, i) => (
          <AnimatedSection key={r.id} delay={i * 0.1}>
            <div className="glass h-full rounded-xl2 p-6 shadow-soft">
              <div className="flex gap-1 text-pink-500">
                {Array.from({ length: r.rating }).map((_, idx) => (
                  <Star key={idx} size={16} fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <p className="mt-4 text-sm text-ink/70">{r.text}</p>
              <p className="mt-4 text-sm font-semibold">{r.author}</p>
            </div>
          </AnimatedSection>
        ))}
      </div>
    </section>
  );
}
