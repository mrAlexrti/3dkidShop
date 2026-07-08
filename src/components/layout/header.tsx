"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, X, Menu, ChevronDown } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { LangSwitcher } from "@/components/layout/lang-switcher";
import { BlueBlob, SunChar, FlowerChar, HeartChar } from "@/components/layout/header-characters";
import { cn } from "@/lib/utils";

export type NavCategory = {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
};

/* ─── Пухлый 3D-логотип «3D Kid» (bubble-стиль под ескиз) ─────── */
function Logo3DKid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 210 120" className={className} aria-label="3D Kid" fill="none">
      <g
        fontFamily="'Fredoka', 'Nunito', system-ui, sans-serif"
        fontWeight={600}
        fill="#fff"
        stroke="#3A2632"
        strokeWidth={6}
        paintOrder="stroke"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 6px 0 rgba(58,38,50,0.18))" }}
      >
        <text x="105" y="66" fontSize="74" textAnchor="middle" letterSpacing="2">3D</text>
        <text x="105" y="108" fontSize="40" textAnchor="middle" letterSpacing="4">kid</text>
      </g>
    </svg>
  );
}

/* ─── Жёлтая звёздочка-искра ──────────────────────────────────── */
function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden fill="none">
      <path
        d="M12 0c1 6 5 10 12 12-7 2-11 6-12 12-1-6-5-10-12-12C7 10 11 6 12 0Z"
        fill="#FFD84D"
      />
    </svg>
  );
}

/* ─── Волна-переход к кремовому фону ──────────────────────────── */
function Wave() {
  return (
    <svg
      viewBox="0 0 1440 70"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute bottom-0 left-0 w-full"
      preserveAspectRatio="none"
      style={{ height: "52px" }}
      aria-hidden
    >
      <path
        d="M0,28 C120,60 260,6 420,34 C560,58 700,8 860,34 C1020,60 1180,10 1320,32 C1380,42 1420,34 1440,30 L1440,70 L0,70 Z"
        fill="#FBF7F2"
      />
    </svg>
  );
}

/* ─── Декоративные персонажи по углам ─────────────────────────── */
function HeroCharacters() {
  return (
    <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
      <BlueBlob
        className="animate-float absolute h-14 w-14 drop-shadow-md md:h-20 md:w-20"
        style={{ left: "3%", top: "12%" }}
      />
      <SunChar
        className="animate-float-slow absolute h-16 w-16 drop-shadow-md md:h-24 md:w-24"
        style={{ right: "3%", top: "6%" }}
      />
      <FlowerChar
        className="animate-float-slow absolute hidden h-16 w-16 drop-shadow-md sm:block md:h-20 md:w-20"
        style={{ left: "9%", bottom: "26%" }}
      />
      <HeartChar
        className="animate-float absolute h-16 w-16 drop-shadow-md md:h-24 md:w-24"
        style={{ right: "5%", bottom: "22%" }}
      />

      {/* искры вокруг логотипа */}
      <Sparkle className="absolute h-4 w-4 md:h-5 md:w-5" style={{ left: "34%", top: "26%" }} />
      <Sparkle className="absolute h-3 w-3 md:h-4 md:w-4" style={{ right: "34%", top: "20%" }} />
      <Sparkle className="absolute h-3 w-3 md:h-4 md:w-4" style={{ left: "40%", bottom: "32%" }} />
      <Sparkle className="absolute h-4 w-4 md:h-5 md:w-5" style={{ right: "38%", bottom: "28%" }} />
    </div>
  );
}

/* ─── Главный Header ──────────────────────────────────────────── */
export function Header({ categories }: { categories: NavCategory[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const count = useCartStore((s) => s.count());
  const openCart = useCartStore((s) => s.openCart);
  const { t } = useLangStore();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 6);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* ══ РОЗОВЫЙ HERO ══════════════════════════════════════════ */}
      <div
        className="relative min-h-[150px] w-full overflow-hidden md:min-h-[180px]"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 18%, #FFD6E2 0%, #FFA9C3 46%, #FF83A8 100%)",
        }}
      >
        <HeroCharacters />

        {/* верхняя строка: бургер | (лого по центру) | язык+корзина */}
        <div className="relative z-10 flex items-start justify-between px-4 pt-4 md:px-6">
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/30 text-white transition-colors hover:bg-white/45 md:invisible"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={t.nav.menu}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="flex items-center gap-2">
            <LangSwitcher />
            <button
              onClick={openCart}
              className="relative grid h-9 w-9 place-items-center rounded-full bg-white/30 text-white transition-colors hover:bg-white/45"
              aria-label={t.cart.title}
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

        {/* центральный логотип */}
        <div className="pointer-events-none absolute inset-x-0 top-[38px] z-[5] flex justify-center md:top-[40px]">
          <Link href="/" aria-label="3D Kid" className="pointer-events-auto">
            <Logo3DKid className="h-[92px] w-auto transition-transform hover:scale-105 md:h-[110px]" />
          </Link>
        </div>

        <Wave />
      </div>

      {/* ══ НАВИГАЦИЯ КАТЕГОРИЙ (desktop) ═════════════════════════ */}
      <div
        className={cn(
          "hidden border-b border-pink-100 bg-[#FBF7F2]/95 backdrop-blur-sm transition-shadow duration-200 md:block",
          scrolled && "shadow-md shadow-pink-100/60"
        )}
      >
        <nav className="container-shop flex items-center justify-center gap-1 py-2">
          <Link
            href="/catalog"
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-pink-100 hover:text-pink-600"
          >
            {t.nav.all}
          </Link>

          {categories.map((c) => (
            <div key={c.id} className="group relative">
              <Link
                href={`/catalog?category=${c.slug}`}
                className="flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-pink-100 hover:text-pink-600"
              >
                {c.name}
                {c.children.length > 0 && (
                  <ChevronDown size={14} className="transition-transform group-hover:rotate-180" />
                )}
              </Link>

              {c.children.length > 0 && (
                <div className="invisible absolute left-1/2 top-full z-20 min-w-[200px] -translate-x-1/2 pt-2 opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white p-1.5 shadow-glass">
                    {c.children.map((ch) => (
                      <Link
                        key={ch.id}
                        href={`/catalog?category=${ch.slug}`}
                        className="block rounded-xl px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-pink-50 hover:text-pink-600"
                      >
                        {ch.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* ══ МОБИЛЬНОЕ МЕНЮ ════════════════════════════════════════ */}
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
              <Link
                href="/catalog"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold transition-colors hover:bg-pink-50 hover:text-pink-600"
              >
                {t.nav.all}
              </Link>

              {categories.map((c) => (
                <div key={c.id}>
                  <Link
                    href={`/catalog?category=${c.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm font-semibold transition-colors hover:bg-pink-50 hover:text-pink-600"
                  >
                    {c.name}
                  </Link>
                  {c.children.length > 0 && (
                    <div className="ml-3 flex flex-col border-l border-pink-100 pl-2">
                      {c.children.map((ch) => (
                        <Link
                          key={ch.id}
                          href={`/catalog?category=${ch.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="rounded-lg px-4 py-2 text-sm text-ink/70 transition-colors hover:bg-pink-50 hover:text-pink-600"
                        >
                          {ch.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
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
