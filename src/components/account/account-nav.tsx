"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, House, LogOut, Package, UserRound } from "lucide-react";
import { signOutCustomer } from "@/lib/customer/actions";
import { announceCartSessionChange } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";

export function AccountNav({ display, initials }: { display: string; initials: string }) {
  const pathname = usePathname();
  const { t: { account } } = useLangStore();
  const sections = [
    { href: "/account", title: account.overview, Icon: House },
    { href: "/account/profile", title: account.myProfile, Icon: UserRound },
    { href: "/account/favorites", title: account.favorites, Icon: Heart },
    { href: "/account/orders", title: account.myOrders, Icon: Package },
  ];
  return <aside className="ac-sidebar">
    <div className="ac-identity">
      <span className="ac-avatar" aria-hidden="true">{initials}</span>
      <p>{display}</p>
    </div>
    <nav aria-label={account.title} className="ac-nav">
      <ul>{sections.map(({ href, title, Icon }) => {
        const active = pathname === href ? "page" : href !== "/account" && pathname.startsWith(href + "/") ? "location" : undefined;
        return <li key={href}><Link href={href} prefetch={false} aria-current={active}><Icon size={20} aria-hidden="true" /><span>{title}</span></Link></li>;
      })}</ul>
      <form action={signOutCustomer} onSubmit={announceCartSessionChange} className="ac-signout"><button type="submit"><LogOut size={19} aria-hidden="true" />{account.signOut}</button></form>
    </nav>
  </aside>;
}
