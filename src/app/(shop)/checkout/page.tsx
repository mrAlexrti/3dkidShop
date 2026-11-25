import { CheckoutPageContent } from "@/components/checkout/checkout-page";
import { isOnlinePaymentAvailable } from "@/lib/payments/online-payment";
import { getT } from "@/lib/i18n-server";
import { customerSession, favoritesVersion } from "@/lib/customer/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT()).checkout.title };
}

export default async function CheckoutPage() {
  const customer = await customerSession();
  const contact = customer ? {
    customerName: customer.firstName ?? "", customerSurname: customer.lastName ?? "",
    customerPhone: customer.phone ?? "", customerEmail: customer.emailVerified ? customer.email : "",
  } : undefined;
  return <CheckoutPageContent onlineCardEnabled={isOnlinePaymentAvailable()} contact={contact}
    profileScope={customer ? favoritesVersion(customer.binding) : undefined} />;
}
