import { translations, type Locale } from "@/lib/i18n";
import { statusLabels, type StatusSnapshot } from "@/lib/status";

export function OrderStatusSummary({ order, locale = "ua" }: { order: StatusSnapshot; locale?: Locale }) {
  const labels = statusLabels(order, locale);
  return <dl className="space-y-1 text-sm">
    {(["order", "payment", "delivery"] as const).map((axis) => <div key={axis}>
      <dt className="inline text-ink/50">{translations[locale].statuses.fields[axis]}: </dt>
      <dd className="inline">{labels[axis]}</dd>
    </div>)}
  </dl>;
}
