import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { FavoritesProvider } from "@/components/product/favorite-button";
import { getCategoryTree } from "@/lib/categories";
import type { CSSProperties } from "react";
import { FONT_THEMES } from "@/lib/fonts";
import { getStorefrontContent } from "@/lib/site-settings";
import "./storefront.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [categories, content] = await Promise.all([getCategoryTree(), getStorefrontContent()]);

  return (
    <div className="storefront" style={{ "--font-body": FONT_THEMES.comfortaa.body, "--font-display": FONT_THEMES.comfortaa.display } as CSSProperties}>
      <link rel="preload" href="/fonts/comfortaa-bold-700.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      <Header categories={categories} />
      <FavoritesProvider><main id="main-content" tabIndex={-1}>{children}</main></FavoritesProvider>
      <Footer categories={categories} content={content} />
      <CartDrawer />
    </div>
  );
}
