import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { getCategoryTree } from "@/lib/categories";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategoryTree();

  return (
    <>
      <Header categories={categories} />
      {/*
        Высота хедера:
        - розовый Hero: 150px (mobile) / 180px (desktop)
        - полоса категорий (только desktop): ~48px
      */}
      <main className="pt-[150px] md:pt-[220px]">{children}</main>
      <Footer categories={categories} />
      <CartDrawer />
    </>
  );
}
