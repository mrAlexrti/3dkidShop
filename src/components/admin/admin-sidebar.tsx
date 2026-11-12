"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLangStore } from "@/store/lang-store";
import { LangSwitcher } from "@/components/layout/lang-switcher";

export function AdminSidebar() {
  const pathname = usePathname();
  const { t } = useLangStore();
  const [open, setOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", onResize);
    onResize();

    const main = document.getElementById("admin-content");
    const openButton = openRef.current;
    const background = [main, headerRef.current].filter((el): el is HTMLElement => !!el);
    const previousInert = background.map((el) => el.inert);
    background.forEach((el) => { el.inert = true; });
    const scrollY = window.scrollY;
    const previousStyle = { position: document.body.style.position, top: document.body.style.top,
      width: document.body.style.width, overflow: document.body.style.overflow };
    Object.assign(document.body.style, { position: "fixed", top: `-${scrollY}px`, width: "100%", overflow: "hidden" });
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const controls = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      desktop.removeEventListener("change", onResize);
      document.removeEventListener("keydown", onKeyDown);
      background.forEach((el, index) => { el.inert = previousInert[index]; });
      Object.assign(document.body.style, previousStyle);
      window.scrollTo({ top: scrollY, behavior: "instant" });
      if (openButton?.getClientRects().length) openButton.focus();
    };
  }, [open]);

  const links = [
    { href: "/admin", label: t.admin.nav.dashboard, icon: LayoutDashboard },
    { href: "/admin/products", label: t.admin.nav.products, icon: Package },
    { href: "/admin/categories", label: t.admin.nav.categories, icon: FolderTree },
    { href: "/admin/orders", label: t.admin.nav.orders, icon: ShoppingCart },
    { href: "/admin/content", label: t.admin.nav.content, icon: FileText },
  ];

  return (
    <>
    <header ref={headerRef} className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-pink-100 bg-cream px-4 lg:hidden">
      <span className="font-display text-xl text-pink-600">3D&nbsp;Kid<span className="text-ink">.</span> Admin</span>
      <button ref={openRef} type="button" aria-label={t.nav.menu} aria-expanded={open} aria-controls="admin-navigation"
        onClick={() => setOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-pink-50">
        <Menu aria-hidden="true" size={24} />
      </button>
    </header>
    {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/40 lg:hidden" />}
    <aside ref={sidebarRef} id="admin-navigation" role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-label="3D Kid Admin"
      className={cn("fixed inset-y-0 left-0 z-50 h-[100dvh] w-[min(18rem,calc(100vw-2rem))] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-pink-100 bg-cream p-5 lg:static lg:flex lg:h-screen lg:w-64 lg:overflow-y-visible lg:bg-white/70", open ? "flex" : "hidden")}>
      <button ref={closeRef} type="button" aria-label={t.nav.closeMenu} onClick={() => setOpen(false)}
        className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl hover:bg-pink-50 lg:hidden">
        <X aria-hidden="true" size={24} />
      </button>
      <Link href="/" onClick={() => setOpen(false)} className="font-display text-xl text-pink-600">
        3D&nbsp;Kid<span className="text-ink">.</span> Admin
      </Link>

      <div className="mt-4">
        <LangSwitcher />
      </div>

      <nav aria-label="3D Kid Admin" className="mt-6 flex flex-1 flex-col gap-1">
        {links.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:min-h-0",
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
        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-pink-50 lg:min-h-0"
      >
        <LogOut size={18} /> {t.admin.logout}
      </button>
    </aside>
    </>
  );
}
