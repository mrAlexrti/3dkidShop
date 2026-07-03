"use client";

import Link from "next/link";
import { Instagram, Facebook, Mail, Phone } from "lucide-react";
import { useLangStore } from "@/store/lang-store";

export function Footer() {
  const { t } = useLangStore();

  return (
    <footer className="mt-24 border-t border-pink-100 bg-white/60">
      <div className="container-shop grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="font-display text-2xl text-pink-500">3D Kid.</div>
          <p className="mt-3 text-sm text-ink/60">
            {t.footer.delivery}. {t.footer.returns}.
          </p>
          <div className="mt-4 flex gap-3">
            <a href="#" aria-label="Instagram" className="rounded-full bg-pink-50 p-2 hover:bg-pink-100 transition-colors">
              <Instagram size={18} />
            </a>
            <a href="#" aria-label="Facebook" className="rounded-full bg-pink-50 p-2 hover:bg-pink-100 transition-colors">
              <Facebook size={18} />
            </a>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-pink-500">
            {t.footer.shop}
          </h4>
          <ul className="space-y-2 text-sm text-ink/70">
            <li><Link href="/catalog" className="hover:text-pink-600 transition-colors">{t.nav.catalog}</Link></li>
            <li><Link href="/catalog?category=stickers" className="hover:text-pink-600 transition-colors">{t.nav.toys}</Link></li>
            <li><Link href="/catalog?category=merch" className="hover:text-pink-600 transition-colors">{t.nav.keychains}</Link></li>
            <li><Link href="/cart" className="hover:text-pink-600 transition-colors">{t.nav.cart}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-pink-500">
            {t.footer.info}
          </h4>
          <ul className="space-y-2 text-sm text-ink/70">
            <li className="cursor-pointer hover:text-pink-600 transition-colors">{t.footer.delivery}</li>
            <li className="cursor-pointer hover:text-pink-600 transition-colors">{t.footer.returns}</li>
            <li className="cursor-pointer hover:text-pink-600 transition-colors">{t.footer.terms}</li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-pink-500">
            {t.footer.contacts}
          </h4>
          <ul className="space-y-2 text-sm text-ink/70">
            <li className="flex items-center gap-2">
              <Mail size={16} className="text-pink-400 shrink-0" />
              hello@3dkid.shop
            </li>
            <li className="flex items-center gap-2">
              <Phone size={16} className="text-pink-400 shrink-0" />
              +380 (00) 000-00-00
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-pink-100 py-4 text-center text-xs text-ink/50">
        © {new Date().getFullYear()} 3D Kid. {t.footer.rights}
      </div>
    </footer>
  );
}
