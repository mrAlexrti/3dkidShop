import type { Metadata } from "next";
import { getLocale, getT } from "@/lib/i18n-server";
import { isOnlinePaymentAvailable } from "@/lib/payments/online-payment";
import { translations } from "@/lib/i18n";
import { getStorefrontContent } from "@/lib/site-settings";
import { pageSeo, resolveSeo } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, content] = await Promise.all([getLocale(), getStorefrontContent()]);
  const page = translations[locale].pages.deliveryPayment;
  return pageSeo({ seo: resolveSeo(content, locale), path: "/delivery-payment", locale, title: page.title, description: page.metaDescription });
}

export default async function DeliveryPaymentPage() {
  const { pages: { deliveryPayment: page } } = await getT();
  return <article className="sf-shell sf-information">
    <h1>{page.title}</h1>
    <section aria-labelledby="delivery-heading">
      <h2 id="delivery-heading">{page.deliveryTitle}</h2>
      <p>{page.delivery}</p><p>{page.cost}</p>
    </section>
    <section aria-labelledby="payment-heading">
      <h2 id="payment-heading">{page.paymentTitle}</h2>
      <p>{page.payment}</p>
      {isOnlinePaymentAvailable() && <p>{page.card}</p>}
    </section>
    <section aria-labelledby="order-heading">
      <h2 id="order-heading">{page.orderTitle}</h2>
      <p>{page.order}</p>
    </section>
  </article>;
}
