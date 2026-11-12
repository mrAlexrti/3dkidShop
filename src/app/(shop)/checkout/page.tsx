import { CheckoutPageContent } from "@/components/checkout/checkout-page";
import { isOnlinePaymentAvailable } from "@/lib/payments/online-payment";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  return { title: (await getT()).checkout.title };
}

export default function CheckoutPage() {
  return <CheckoutPageContent onlineCardEnabled={isOnlinePaymentAvailable()} />;
}
