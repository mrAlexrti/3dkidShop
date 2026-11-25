"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { refreshAccountCart, restoreGuestCart, useCartStore } from "@/store/cart-store";
import { CART_STORAGE_KEY } from "@/lib/cart-persistence";
import { CART_SYNC_KEY } from "@/lib/customer/guest-cart";
import { useLangStore } from "@/store/lang-store";

export function CartSync() {
  const pathname = usePathname();
  const isOpen = useCartStore((state) => state.isOpen);
  const { locale } = useLangStore();
  const inCart = pathname === "/cart" || pathname === "/checkout" || pathname === "/checkout/success";
  useEffect(() => {
    if ((isOpen || inCart) && !useCartStore.getState().busy) void refreshAccountCart();
  }, [pathname, inCart, isOpen, locale]);
  useEffect(() => {
    let last = 0;
    const focus = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 1500) return;
      last = Date.now();
      void refreshAccountCart();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === CART_SYNC_KEY) void refreshAccountCart();
      if (event.key === CART_STORAGE_KEY && useCartStore.getState().accountScope === null) restoreGuestCart();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  return null;
}
