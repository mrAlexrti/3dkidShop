import Link from "next/link";
import { ArrowRight, Heart, Package, Sparkles, Store, UserRound } from "lucide-react";
import { AccountEmpty } from "@/components/account/account-surface";
import { AccountIllustration } from "@/components/account/account-illustration";
import { AccountOrderList, accountOrderPreview } from "@/components/account/account-order-list";
import { formatAccountCount } from "@/lib/customer/copy";
import { ownedOrders, requireCustomer } from "@/lib/customer/pages";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { resolveAccountIllustration } from "@/lib/site-content";
import { getStorefrontContent } from "@/lib/site-settings";

const previewSize = 3;

export default async function AccountOverview() {
  const [customer, locale] = await Promise.all([requireCustomer(), getLocale()]);
  const t = translations[locale].account;
  const orderScope = ownedOrders(customer.id);
  const [recent, favorites, content] = await Promise.all([
    prisma.order.findMany({ where: orderScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: previewSize + 1, select: accountOrderPreview }),
    prisma.customerFavorite.count({ where: { userId: customer.id, product: { isActive: true } } }),
    getStorefrontContent(),
  ]);
  // Most customers have only a few orders. A separate count is needed only once the preview fills.
  const orderCount = recent.length > previewSize ? await prisma.order.count({ where: orderScope }) : recent.length;
  const name = customer.firstName?.trim() || customer.lastName?.trim();
  const shortcuts = [
    { href: "/account/orders", title: t.myOrders, caption: formatAccountCount(locale, orderCount, "orders"), Icon: Package, tone: "blue" },
    { href: "/account/favorites", title: t.favorites, caption: formatAccountCount(locale, favorites, "favorites"), Icon: Heart, tone: "pink" },
    { href: "/account/profile", title: t.myProfile, caption: t.profileHint, Icon: UserRound, tone: "lilac" },
    { href: "/catalog", title: t.continueShopping, caption: t.shopHint, Icon: Store, tone: "peach" },
  ];
  return <>
    <header className="ac-welcome">
      <div className="ac-welcome-copy"><h1>{name ? t.welcomeName(name) : t.welcomeTitle}</h1><p>{t.welcome}</p></div>
      <div className="ac-welcome-art" aria-hidden="true">
        <Sparkles className="ac-welcome-spark" size={32} />
        <AccountIllustration {...resolveAccountIllustration(content, "account_welcome_image")} />
      </div>
    </header>
    <ul className="ac-shortcuts">{shortcuts.map(({ href, title, caption, Icon, tone }) => <li key={href}>
      <Link className="ac-shortcut" href={href} prefetch={false}>
        <span className="ac-mark" data-tone={tone} aria-hidden="true"><Icon size={23} /></span>
        <span className="ac-shortcut-copy"><strong>{title}</strong><span>{caption}</span></span>
        <ArrowRight className="ac-shortcut-arrow" size={18} aria-hidden="true" />
      </Link>
    </li>)}</ul>
    <section className="ac-panel ac-recent">
      <header className="ac-panel-heading ac-panel-heading--split">
        <h2>{t.recentOrders}</h2>
        {recent.length > 0 && <Link className="ac-text-link" href="/account/orders" prefetch={false}>{t.allOrders}<ArrowRight size={16} aria-hidden="true" /></Link>}
      </header>
      {recent.length > 0 ? <AccountOrderList orders={recent.slice(0, previewSize)} locale={locale} /> :
        <AccountEmpty title={t.emptyOrders} description={t.emptyOrdersHint} cta={t.continueShopping} icon={<Package size={26} />} />}
    </section>
  </>;
}
