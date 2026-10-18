import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { getCategoryTree } from "@/lib/categories";
import "./storefront.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategoryTree();

  return (
    <div className="storefront">
      <Header categories={categories} />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer categories={categories} />
      <CartDrawer />
    </div>
  );
}
