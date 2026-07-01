"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingBag, X, Menu } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/catalog?category=stickers", label: "Стікери", emoji: "🏷️" },
  { href: "/catalog?category=merch",    label: "Брелоки",  emoji: "🔑" },
  { href: "/catalog?category=posters",  label: "Постери",  emoji: "🎨" },
  { href: "/catalog?category=cards",    label: "Курси",    emoji: "⭐" },
  { href: "/catalog",                   label: "Усе",      emoji: "🛍️" },
];

// SVG-персонажи вдоль волны (inline, без внешних зависимостей)
function WaveCharacters() {
  return (
    <svg
      viewBox="0 0 1440 120"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute bottom-0 left-0 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Волна */}
      <path
        d="M0,60 C200,110 400,20 600,70 C800,120 1000,30 1200,75 C1320,100 1380,55 1440,60 L1440,120 L0,120 Z"
        fill="#FBF7F2"
      />
      {/* Маленькие кружочки-персонажи, высовывающиеся из волны */}
      <circle cx="180" cy="62" r="28" fill="#FFD6E0" stroke="#FF7099" strokeWidth="2"/>
      <text x="180" y="70" textAnchor="middle" fontSize="22">🌸</text>

      <circle cx="420" cy="48" r="26" fill="#C7F0FF" stroke="#7DD3FC" strokeWidth="2"/>
      <text x="420" y="56" textAnchor="middle" fontSize="20">⭐</text>

      <circle cx="720" cy="34" r="30" fill="#FFE4C4" stroke="#FB923C" strokeWidth="2"/>
      <text x="720" y="43" textAnchor="middle" fontSize="24">☀️</text>

      <circle cx="1020" cy="44" r="26" fill="#E0D4FF" stroke="#A78BFA" strokeWidth="2"/>
      <text x="1020" y="53" textAnchor="middle" fontSize="20">💜</text>

      <circle cx="1260" cy="56" r="28" fill="#D4F7D4" stroke="#4ADE80" strokeWidth="2"/>
      <text x="1260" y="65" textAnchor="middle" fontSize="22">🌻</text>
    </svg>
  );
}

export function Header() {
  const [scrolled, setScrolled]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ]     = useState("");
  const count   = useCartStore((s) => s.count());
  const openCart = useCartStore((s) => s.openCart);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* ── РОЗОВА ШАПКА з хвилею ── */}
      <div className="relative bg-pink-500 pb-[68px] pt-3">
        {/* Логотип по центру */}
        <div className="container-shop flex items-center justify-between">
          {/* Ліва частина: бургер (mobile) */}
          <button
            className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Меню"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Логотип */}
          <Link
            href="/"
            className="absolute left-1/2 -translate-x-1/2 font-display text-2xl font-bold tracking-tight text-white drop-shadow"
          >
            STIKR<span className="opacity-70">.</span>
          </Link>

          {/* Права частина: пошук + кошик */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              aria-label="Пошук"
            >
              <Search size={18} />
            </button>
            <button
              onClick={openCart}
              className="relative grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              aria-label="Кошик"
            >
              <ShoppingBag size={18} />
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white"
                >
                  {count}
                </motion.span>
              )}
            </button>
          </div>
        </div>

        {/* Хвиля з персонажами */}
        <WaveCharacters />
      </div>

      {/* ── НАВІГАЦІЯ КАТЕГОРІЙ ── */}
      <div
        className={cn(
          "hidden border-b border-pink-100 bg-cream/95 backdrop-blur transition-shadow md:block",
          scrolled && "shadow-soft"
        )}
      >
        <nav className="container-shop flex items-center justify-center gap-1 py-2">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-ink/70 transition-colors hover:bg-pink-100 hover:text-pink-600"
            >
              <span>{l.emoji}</span>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* ── МОБІЛЬНЕ МЕНЮ ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-pink-100 bg-cream/98 md:hidden"
          >
            <nav className="container-shop flex flex-col gap-1 py-4">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-pink-50"
                >
                  <span className="text-xl">{l.emoji}</span>
                  {l.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── РЯДОК ПОШУКУ ── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border-b border-pink-100 bg-white/95 backdrop-blur"
          >
            <form
              className="container-shop flex items-center gap-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQ.trim()) {
                  window.location.href = `/catalog?q=${encodeURIComponent(searchQ.trim())}`;
                }
                setSearchOpen(false);
              }}
            >
              <Search size={18} className="shrink-0 text-ink/40" />
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Пошук товарів..."
                className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink/40"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-full p-1 hover:bg-pink-50"
              >
                <X size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
