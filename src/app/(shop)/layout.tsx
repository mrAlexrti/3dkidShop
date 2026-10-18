import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { getCategoryTree } from "@/lib/categories";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategoryTree();

  return (
    <>
      <Header categories={categories} />
      <main>{children}</main>
      <Footer categories={categories} />
      <CartDrawer />
    </>
  );
}
