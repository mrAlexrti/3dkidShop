"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, X, Menu } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { LangSwitcher } from "@/components/layout/lang-switcher";
import { cn } from "@/lib/utils";

/* ─── SVG логотип "3D Kid" ─────────────────────────────── */
function Logo3DKid({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="3D Kid"
    >
      {/* Тень / глубина для объёма */}
      <text
        x="12" y="60"
        fontFamily="'Arial Rounded MT Bold', 'Arial Black', sans-serif"
        fontSize="60"
        fontWeight="900"
        fill="rgba(0,0,0,0.18)"
        transform="translate(3,3)"
      >3D</text>
      {/* Основной текст "3D" */}
      <text
        x="12" y="60"
        fontFamily="'Arial Rounded MT Bold', 'Arial Black', sans-serif"
        fontSize="60"
        fontWeight="900"
        fill="white"
      >3D</text>
      {/* Тень "kid" */}
      <text
        x="28" y="82"
        fontFamily="'Arial Rounded MT Bold', 'Arial Black', sans-serif"
        fontSize="28"
        fontWeight="900"
        fill="rgba(0,0,0,0.18)"
        letterSpacing="6"
        transform="translate(3,3)"
      >kid</text>
      {/* "kid" */}
      <text
        x="28" y="82"
        fontFamily="'Arial Rounded MT Bold', 'Arial Black', sans-serif"
        fontSize="28"
        fontWeight="900"
        fill="white"
        letterSpacing="6"
      >kid</text>
      {/* Декоративные искры */}
      <text x="108" y="24" fontSize="16" opacity="0.9">✨</text>
      <text x="4"   y="20" fontSize="12" opacity="0.8">⭐</text>
      <text x="140" y="55" fontSize="11" opacity="0.7">•</text>
    </svg>
  );
}

/* ─── Декоративные персонажи + SVG волна ───────────────── */
function WaveSection() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 select-none overflow-hidden"
      style={{ height: "80px" }}
      aria-hidden
    >
      {/* Персонажи */}
      <span className="absolute text-[44px] drop-shadow-md" style={{ left: "6%",  bottom: "38px" }}>😤</span>
      <span className="absolute text-[44px] drop-shadow-md" style={{ left: "20%", bottom: "30px" }}>🌼</span>
      <span className="absolute text-[42px] drop-shadow-md" style={{ right: "26%",bottom: "36px" }}>☀️</span>
      <span className="absolute text-[44px] drop-shadow-md" style={{ right: "6%", bottom: "28px" }}>❤️</span>

      {/* Декоративные белые точки — имитация снега/текстуры */}
      {[
        [15,65],[30,75],[46,60],[60,78],[72,62],[87,72],[95,58],
        [10,45],[22,50],[38,42],[54,48],[70,44],[83,50],[94,40],
      ].map(([x, y], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/50"
          style={{ left: `${x}%`, top: `${y}%`, width: "5px", height: "5px" }}
        />
      ))}

      {/* Волна */}
      <svg
        viewBox="0 0 1440 60"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute bottom-0 left-0 w-full"
        preserveAspectRatio="none"
        style={{ height: "60px" }}
      >
        <path
          d="M0,22 C100,50 220,4 360,30 C500,56 620,6 740,34 
             C860,60 980,8 1100,32 C1220,56 1340,14 1440,28 
             L1440,60 L0,60 Z"
          fill="#FBF7F2"
        />
      </svg>
    </div>
  );
}

/* ─── Главный компонент Header ──────────────────────────── */
export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled,   setScrolled]   = useState(false);
  const count    = useCartStore((s) => s.count());
  const openCart = useCartStore((s) => s.openCart);
  const { t }    = useLangStore();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 6);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const navLinks = [
    { href: "/catalog",                   label: t.nav.all       },
    { href: "/catalog?category=stickers", label: t.nav.stickers  },
    { href: "/catalog?category=posters",  label: t.nav.posters   },
    { href: "/catalog?category=merch",    label: t.nav.merch     },
    { href: "/catalog?category=cards",    label: t.nav.cards     },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50">

      {/* ══ РОЗОВА ШАПКА ══════════════════════════════════ */}
      <div
        className="relative w-full bg-pink-400 overflow-hidden"
        style={{ minHeight: "136px" }}
      >
        {/* Верхняя строка: бургер | логотип | корзина+язык */}
        <div className="relative z-10 container-shop flex items-start justify-between pt-4 pb-16">

          {/* Мобильный бургер */}
          <button
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/25 text-white md:invisible"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Меню"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Центральный логотип */}
          <div className="absolute left-1/2 -translate-x-1/2 top-3">
            <Link href="/" aria-label="3D Kid — на головну">
              <Logo3DKid className="h-[78px] w-auto drop-shadow-lg hover:scale-105 transition-transform" />
            </Link>
          </div>

          {/* Правый блок: переключатель языка + корзина */}
          <div className="mt-1 flex items-center gap-2">
            <LangSwitcher />
            <button
              onClick={openCart}
              className="relative grid h-9 w-9 place-items-center rounded-full bg-white/25 text-white transition-colors hover:bg-white/40"
              aria-label="Кошик"
            >
              <ShoppingBag size={20} />
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white"
                >
                  {count}
                </motion.span>
              )}
            </button>
          </div>
        </div>

        {/* Персонажи + волна */}
        <WaveSection />
      </div>

      {/* ══ НАВИГАЦИЯ КАТЕГОРИЙ (desktop) ════════════════ */}
      <div
        className={cn(
          "hidden border-b border-pink-100 bg-[#FBF7F2]/95 backdrop-blur-sm md:block",
          "transition-shadow duration-200",
          scrolled && "shadow-md shadow-pink-100/60"
        )}
      >
        <nav className="container-shop flex items-center justify-center gap-1 py-2">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group relative rounded-full px-5 py-1.5 text-sm font-semibold tracking-wide text-ink/70 transition-colors hover:bg-pink-100 hover:text-pink-600"
            >
              {l.label}
              <span className="absolute bottom-1 left-4 right-4 h-[2px] scale-x-0 rounded-full bg-pink-400 transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>
      </div>

      {/* ══ МОБИЛЬНОЕ МЕНЮ ════════════════════════════════ */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-b border-pink-100 bg-[#FBF7F2]/98 md:hidden"
          >
            <nav className="container-shop flex flex-col gap-1 py-4">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-pink-50 hover:text-pink-600 transition-colors"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-3 px-4">
                <LangSwitcher />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
