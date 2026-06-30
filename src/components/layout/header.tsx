"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, ShoppingBag, Menu, X } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/catalog?category=stickers", label: "Стикеры" },
  { href: "/catalog?category=posters", label: "Постеры" },
  { href: "/catalog?category=merch", label: "Мерч" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = useCartStore((s) => s.count());
  const openCart = useCartStore((s) => s.openCart);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50" style={{ ["--header-h" as string]: scrolled ? "76px" : "104px" }}>
      {/* Розовая строка во всю длину экрана с логотипом по центру */}
      <div className="glass-pink w-full text-white">
        <div className="container-shop flex items-center justify-center py-2 text-xs tracking-[0.2em] uppercase">
          Бесплатная доставка от 30€ · Наклей немного радости
        </div>
      </div>

      <div
        className={cn(
          "glass transition-all duration-300",
          scrolled ? "shadow-soft" : ""
        )}
      >
        <div className="container-shop flex items-center justify-between py-4">
          <Link href="/" className="font-display text-2xl tracking-tight text-pink-600">
            STIKR<span className="text-ink">.</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink/80">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="relative transition-colors hover:text-pink-600 group">
                {l.label}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-pink-500 transition-all group-hover:w-full" />
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button aria-label="Поиск" className="rounded-full p-2 hover:bg-pink-50 transition-colors">
              <Search size={20} />
            </button>
            <button
              aria-label="Корзина"
              onClick={openCart}
              className="relative rounded-full p-2 hover:bg-pink-50 transition-colors"
            >
              <ShoppingBag size={20} />
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-pink-500 text-[10px] font-bold text-white"
                >
                  {count}
                </motion.span>
              )}
            </button>
            <button
              aria-label="Меню"
              className="rounded-full p-2 hover:bg-pink-50 transition-colors md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t border-pink-100 bg-white/90 px-6 py-4 flex flex-col gap-4 text-sm"
          >
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)}>
                {l.label}
              </Link>
            ))}
          </motion.nav>
        )}
      </div>
    </header>
  );
}
