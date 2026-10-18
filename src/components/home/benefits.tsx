import { Truck, ShieldCheck, RefreshCcw, Heart } from "lucide-react";
import { getT } from "@/lib/i18n-server";

export async function Benefits() {
  const t = await getT();
  const b = t.home.benefits;
  const items = [
    { icon: Heart, title: b.love, text: b.loveDesc },
    { icon: Truck, title: b.delivery, text: b.deliveryDesc },
    { icon: ShieldCheck, title: b.quality, text: b.qualityDesc },
    { icon: RefreshCcw, title: b.returns, text: b.returnsDesc },
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
