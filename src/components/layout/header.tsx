"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LayoutGrid, Menu, ShoppingBag, X } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { LangSwitcher } from "@/components/layout/lang-switcher";
import { BlueBlob, FlowerChar, HeartChar, SunChar } from "@/components/layout/header-characters";
import type { CategoryTreeNode } from "@/lib/categories";
import { getCategoryName } from "@/lib/category-name";

function Logo3DKid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 210 120" className={className} aria-label="3D Kid" fill="none">
      <g
        fontFamily="var(--font-display)"
        fontWeight={600}
        fill="#fff"
        stroke="#3A2632"
        strokeWidth={5}
        paintOrder="stroke"
        strokeLinejoin="round"
        style={{
          filter:
            "drop-shadow(0 6px 0 rgba(190,112,143,0.2)) drop-shadow(0 12px 18px rgba(118,47,76,0.14))",
        }}
      >
        <text x="105" y="66" fontSize="74" textAnchor="middle" letterSpacing="2">3D</text>
        <text x="105" y="108" fontSize="40" textAnchor="middle" letterSpacing="4">kid</text>
      </g>
    </svg>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M12 0c1 6 5 10 12 12-7 2-11 6-12 12-1-6-5-10-12-12C7 10 11 6 12 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LogoCloud() {
  return (
    <svg
      viewBox="0 0 920 360"
      className="pointer-events-none absolute left-1/2 top-[-16px] z-[1] h-[330px] w-[760px] max-w-[78%] -translate-x-1/2 sm:h-[350px] sm:w-[850px] lg:top-[-26px] lg:h-[390px] lg:w-[960px]"
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-cloud-fill" x1="120" y1="20" x2="760" y2="340" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC8DB" />
          <stop offset=".52" stopColor="#F7A4C2" />
          <stop offset="1" stopColor="#F691B6" />
        </linearGradient>
      </defs>
      <path
        d="M83 320C35 309 18 270 36 231c15-33 47-50 83-44-8-63 38-113 101-108 25-52 91-72 141-39 49-48 135-45 180 6 62-27 133 8 145 72 58-5 108 38 105 96 55 10 84 53 70 106H83Z"
        fill="url(#logo-cloud-fill)"
        stroke="rgba(255,255,255,.72)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M126 303c-29-13-38-43-21-68 19-27 53-31 82-15-5-46 32-83 78-77 28-49 97-57 134-17 48-37 116-18 139 34 48-14 99 17 104 66 39 0 68 29 66 68"
        fill="none"
        stroke="rgba(255,255,255,.22)"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloudGarden() {
  return (
    <svg
      viewBox="0 0 1440 190"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[112px] w-full sm:h-[138px] lg:h-[154px]"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 117C55 76 126 68 184 99c38-67 138-84 200-29 54-38 130-25 164 32 67-55 168-50 224 11 55-49 143-44 187 12 59-67 169-72 233 1 72-57 175-39 248 18v46H0Z"
        fill="#FFF4F3"
        fillOpacity=".72"
      />
      <path
        d="M0 143c73-30 151-22 204 19 42-55 131-66 189-14 49-70 159-82 226-14 46-39 119-40 168 3 69-66 181-66 245 5 44-42 119-47 172-6 69-57 172-47 236 7v47H0Z"
        fill="#FFF9F5"
      />
      <path
        d="M0 172c92-25 181-16 248 18 75-39 173-35 238 0 84-45 200-38 271 0 78-48 194-39 258 0 72-42 173-35 233 0 63-35 132-31 192 0H0Z"
        fill="#FBF7F2"
      />
    </svg>
  );
}

function HeroCharacters() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[4] select-none" aria-hidden>
      <BlueBlob className="bubble-garden-float absolute -left-14 top-16 h-36 w-36 drop-shadow-[0_18px_24px_rgba(52,74,140,0.24)] sm:-left-16 sm:-top-6 sm:h-56 sm:w-56 lg:-left-24 lg:-top-28 lg:h-[360px] lg:w-[360px] xl:h-[400px] xl:w-[400px]" />
      <SunChar className="bubble-garden-float-slow absolute right-44 top-[-64px] hidden h-48 w-48 drop-shadow-[0_18px_24px_rgba(180,121,18,0.2)] sm:block lg:right-52 lg:-top-28 lg:h-[310px] lg:w-[310px] xl:right-56 xl:h-[330px] xl:w-[330px]" />
      <FlowerChar className="bubble-garden-float-slow absolute -bottom-16 left-[4%] hidden h-48 w-48 drop-shadow-[0_18px_24px_rgba(190,111,36,0.18)] sm:block md:h-56 md:w-56 lg:-bottom-24 lg:left-[6%] lg:h-[250px] lg:w-[250px]" />
      <HeartChar className="bubble-garden-float absolute -bottom-14 -right-10 h-36 w-36 drop-shadow-[0_18px_24px_rgba(171,48,81,0.22)] sm:-bottom-20 sm:-right-12 sm:h-52 sm:w-52 lg:-bottom-24 lg:-right-16 lg:h-[280px] lg:w-[280px]" />

      <Sparkle className="absolute left-[29%] top-[22%] h-4 w-4 text-[#FFD85C] sm:h-6 sm:w-6" />
      <Sparkle className="absolute right-[30%] top-[17%] h-3 w-3 text-white/90 sm:h-5 sm:w-5" />
      <Sparkle className="absolute bottom-[29%] left-[35%] h-3 w-3 text-white/90 sm:h-4 sm:w-4" />
      <Sparkle className="absolute bottom-[26%] right-[34%] h-4 w-4 text-[#FFD85C] sm:h-6 sm:w-6" />
      <span className="absolute left-[22%] top-[49%] h-2 w-2 rounded-full bg-white/80" />
      <span className="absolute right-[22%] top-[45%] h-2.5 w-2.5 rounded-full bg-white/75" />
    </div>
  );
}

const mobileMenuId = "mobile-category-menu";

export function Header({ categories }: { categories: CategoryTreeNode[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = useCartStore((state) => state.count());
  const openCart = useCartStore((state) => state.openCart);
  const { locale, t } = useLangStore();

  return (
    <header className="relative z-40 pt-3 sm:pt-5 lg:pt-6">
      <div className="px-3 sm:px-6 lg:px-8">
        <div className="bubble-hero-surface relative mx-auto h-[270px] max-w-[1520px] overflow-hidden sm:h-[320px] md:h-[350px] lg:h-[382px]">
          <LogoCloud />
          <HeroCharacters />

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={t.nav.menu}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
            className="absolute left-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/80 bg-cream/95 text-ink shadow-bubble-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:ring-offset-2 focus-visible:ring-offset-pink-100 sm:left-4 sm:top-4 lg:hidden"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="absolute right-3 top-3 z-30 flex items-center gap-2 sm:right-5 sm:top-5 lg:right-7 lg:top-7">
            <LangSwitcher />
            <button
              type="button"
              onClick={openCart}
              className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/80 bg-cream/95 text-ink shadow-bubble-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:ring-offset-2 focus-visible:ring-offset-pink-100"
              aria-label={t.cart.title}
            >
              <ShoppingBag size={20} />
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink-600 px-1 text-[10px] font-bold text-white"
                >
                  {count}
                </motion.span>
              )}
            </button>
          </div>

          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center pb-14 sm:pb-16 lg:pb-[72px]">
            <Link
              href="/"
              aria-label="3D Kid"
              className="pointer-events-auto rounded-[2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-pink-400"
            >
              <Logo3DKid className="h-[124px] w-auto transition-transform duration-300 hover:scale-[1.025] sm:h-[148px] md:h-[162px] lg:h-[198px]" />
            </Link>
          </div>

          <CloudGarden />
        </div>
      </div>

      <div className="relative z-30 hidden min-h-16 px-8 lg:flow-root">
        <nav
          aria-label={t.nav.catalog}
          className="bubble-nav-surface mx-auto -mt-8 flex min-h-16 w-full max-w-[1040px] flex-wrap items-center justify-center gap-2 px-5 py-2 xl:gap-4 xl:px-7"
        >
          <Link
            href="/catalog"
            className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-bubble-pill border border-pink-100 bg-pink-50 px-5 py-2 text-sm font-semibold text-pink-700 shadow-bubble-soft transition-colors hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <LayoutGrid size={16} aria-hidden />
            {t.nav.all}
          </Link>

          {categories.map((category) => (
            <div key={category.id} className="group relative">
              <Link
                href={`/catalog?category=${category.slug}`}
                className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-bubble-pill px-4 py-2 text-sm font-semibold text-ink/70 transition-colors hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 xl:px-5"
              >
                {getCategoryName(category, locale)}
                {category.children.length > 0 && (
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className="transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
                  />
                )}
              </Link>

              {category.children.length > 0 && (
                <div className="invisible absolute left-1/2 top-full z-50 min-w-[210px] -translate-x-1/2 pt-2 opacity-0 transition-[opacity,visibility] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div className="rounded-[1.5rem] border border-bubble-border bg-cream p-2 shadow-bubble-medium">
                    {category.children.map((child) => (
                      <Link
                        key={child.id}
                        href={`/catalog?category=${child.slug}`}
                        className="block rounded-2xl px-4 py-2.5 text-sm font-medium text-ink/70 transition-colors hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                      >
                        {getCategoryName(child, locale)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            id={mobileMenuId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-3 sm:px-6 lg:hidden"
          >
            <nav
              aria-label={t.nav.catalog}
              className="container-shop mt-2 rounded-[2rem] border border-bubble-border bg-cream/95 py-3 shadow-bubble-medium"
            >
              <Link
                href="/catalog"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <LayoutGrid size={17} aria-hidden />
                {t.nav.all}
              </Link>

              {categories.map((category) => (
                <div key={category.id}>
                  <Link
                    href={`/catalog?category=${category.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="flex min-h-11 items-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    {getCategoryName(category, locale)}
                  </Link>
                  {category.children.length > 0 && (
                    <div className="ml-5 flex flex-col border-l border-pink-200 pl-2">
                      {category.children.map((child) => (
                        <Link
                          key={child.id}
                          href={`/catalog?category=${child.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="flex min-h-10 items-center rounded-xl px-4 py-2 text-sm text-ink/70 transition-colors hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                        >
                          {getCategoryName(child, locale)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
