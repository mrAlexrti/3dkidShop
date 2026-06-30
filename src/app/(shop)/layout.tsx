import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="pt-[var(--header-h)]">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
