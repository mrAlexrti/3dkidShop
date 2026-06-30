import { Truck, ShieldCheck, RefreshCcw, Heart } from "lucide-react";
import { AnimatedSection } from "@/components/shared/animated-section";

const items = [
  { icon: Truck, title: "Быстрая доставка", text: "Отправка в течение 24 часов" },
  { icon: ShieldCheck, title: "Гарантия качества", text: "Премиальные материалы" },
  { icon: RefreshCcw, title: "Лёгкий возврат", text: "14 дней на возврат товара" },
  { icon: Heart, title: "Сделано с любовью", text: "Дизайн собственной разработки" },
];

export function Benefits() {
  return (
    <section className="container-shop mt-24">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((item, i) => (
          <AnimatedSection key={item.title} delay={i * 0.08}>
            <div className="glass rounded-xl2 p-6 text-center shadow-soft">
              <item.icon className="mx-auto mb-3 text-pink-500" size={28} />
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs text-ink/60">{item.text}</p>
            </div>
          </AnimatedSection>
        ))}
      </div>
    </section>
  );
}
