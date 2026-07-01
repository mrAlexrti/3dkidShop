import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {/* pt — отступ под фиксированный хедер (розовая шапка + навигация) */}
      <main className="pt-[128px]">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
