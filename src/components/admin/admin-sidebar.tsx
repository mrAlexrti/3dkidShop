"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLangStore } from "@/store/lang-store";
import { LangSwitcher } from "@/components/layout/lang-switcher";

export function AdminSidebar() {
  const pathname = usePathname();
  const { t } = useLangStore();

  const links = [
    { href: "/admin", label: t.admin.nav.dashboard, icon: LayoutDashboard },
    { href: "/admin/products", label: t.admin.nav.products, icon: Package },
    { href: "/admin/categories", label: t.admin.nav.categories, icon: FolderTree },
    { href: "/admin/orders", label: t.admin.nav.orders, icon: ShoppingCart },
    { href: "/admin/content", label: t.admin.nav.content, icon: FileText },
  ];

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-pink-100 bg-white/70 p-5">
      <Link href="/" className="font-display text-xl text-pink-600">
        3D&nbsp;Kid<span className="text-ink">.</span> Admin
      </Link>

      <div className="mt-4">
        <LangSwitcher />
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {links.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-pink-500 text-white" : "text-ink/70 hover:bg-pink-50"
              )}
            >
              <l.icon size={18} /> {l.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-pink-50"
      >
        <LogOut size={18} /> {t.admin.logout}
      </button>
    </aside>
  );
}
