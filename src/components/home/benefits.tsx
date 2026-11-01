import { Zap, Flower2, Heart } from "lucide-react";
import { getT } from "@/lib/i18n-server";

export async function Benefits() {
  const t = await getT();
  const b = t.home.benefits;
  const items = [
    { icon: Heart, title: b.love, text: b.loveDesc },
    { icon: Zap, title: b.delivery, text: b.deliveryDesc },
    { icon: Flower2, title: b.joy, text: b.joyDesc },
  ];
  return (
    <section className="sf-shell sf-benefits" aria-label={t.home.benefitsLabel}>
      {items.map((item) => (
        <article key={item.title} className="sf-benefit">
          <item.icon size={28} aria-hidden="true" />
          <div><h3>{item.title}</h3><p>{item.text}</p></div>
        </article>
      ))}
    </section>
  );
}
