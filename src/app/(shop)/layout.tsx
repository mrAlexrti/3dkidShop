import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { getCategoryTree } from "@/lib/categories";
import type { CSSProperties } from "react";
import { FONT_THEMES } from "@/lib/fonts";
import "./storefront.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategoryTree();

  return (
    <div className="storefront" style={{ "--font-body": FONT_THEMES.comfortaa.body, "--font-display": FONT_THEMES.comfortaa.display } as CSSProperties}>
      <link rel="preload" href="/fonts/comfortaa-bold-700.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      <Header categories={categories} />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer categories={categories} />
      <CartDrawer />
    </div>
  );
}
