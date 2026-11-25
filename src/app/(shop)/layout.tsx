import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { FavoritesProvider } from "@/components/product/favorite-button";
import { getCategoryTree } from "@/lib/categories";
import type { CSSProperties } from "react";
import { FONT_THEMES } from "@/lib/fonts";
import { getStorefrontContent } from "@/lib/site-settings";
import { cookies } from "next/headers";
import { customerCookie } from "@/lib/customer/security";
import { CartSync } from "@/components/cart/cart-sync";
import "./storefront.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [categories, content, jar] = await Promise.all([getCategoryTree(), getStorefrontContent(), cookies()]);

  return (
    <div className="storefront" style={{ "--font-body": FONT_THEMES.comfortaa.body, "--font-display": FONT_THEMES.comfortaa.display } as CSSProperties}>
      <link rel="preload" href="/fonts/comfortaa-bold-700.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      <FavoritesProvider hasCustomerCookie={jar.has(customerCookie("session").name)}>
        <CartSync />
        <Header categories={categories} />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <Footer categories={categories} content={content} />
      </FavoritesProvider>
      <CartDrawer />
    </div>
  );
}
