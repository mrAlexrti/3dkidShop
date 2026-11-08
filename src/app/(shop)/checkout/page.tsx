import { CheckoutPageContent } from "@/components/checkout/checkout-page";
import { isLiqPayConfigured } from "@/lib/payments/liqpay";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  return { title: (await getT()).checkout.title };
}

export default function CheckoutPage() {
  return <CheckoutPageContent onlineCardEnabled={isLiqPayConfigured()} />;
}
