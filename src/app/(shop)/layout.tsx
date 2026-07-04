import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {/* 
        Высота хедера: 
        - розовая шапка (~130px) + навигация (~44px) = ~174px desktop
        - мобильный (без полоски категорий): ~130px
      */}
      <main className="pt-[136px] md:pt-[174px]">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
