import Link from "next/link";
import { Instagram, Facebook, Mail, Phone } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-pink-100 bg-white/60">
      <div className="container-shop grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="font-display text-2xl text-pink-600">STIKR.</div>
          <p className="mt-3 text-sm text-ink/60">
            Стикеры, постеры и мерч ручной кураторской подборки. Делаем мир чуточку ярче.
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
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide">Магазин</h4>
          <ul className="space-y-2 text-sm text-ink/70">
            <li><Link href="/catalog">Каталог</Link></li>
            <li><Link href="/catalog?category=stickers">Стикеры</Link></li>
            <li><Link href="/catalog?category=posters">Постеры</Link></li>
            <li><Link href="/cart">Корзина</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide">Информация</h4>
          <ul className="space-y-2 text-sm text-ink/70">
            <li>Доставка и оплата</li>
            <li>Возврат товара</li>
            <li>Публичная оферта</li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide">Контакты</h4>
          <ul className="space-y-2 text-sm text-ink/70">
            <li className="flex items-center gap-2"><Mail size={16} /> hello@stikr.shop</li>
            <li className="flex items-center gap-2"><Phone size={16} /> +380 (00) 000-00-00</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-pink-100 py-4 text-center text-xs text-ink/50">
        © {new Date().getFullYear()} STIKR. Все права защищены.
      </div>
    </footer>
  );
}
