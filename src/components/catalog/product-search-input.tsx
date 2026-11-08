"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLangStore } from "@/store/lang-store";
import { cn } from "@/lib/utils";

type Suggestion = { id: string; slug: string; name: string; image: string };
type Result = { key: string; products: Suggestion[] };
const EMPTY_SUGGESTIONS: Suggestion[] = [];

function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return <Image src={failed ? "/images/placeholder.svg" : src} width={48} height={48} sizes="48px"
    alt="" className="sf-suggestion-image" onError={() => setFailed(true)} />;
}

export function ProductSearchInput({ id, value, onValueChange, placeholder, label, className, inputClassName }: {
  id?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  inputClassName?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `product-search-${generatedId}`;
  const listId = `${inputId}-suggestions`;
  const router = useRouter();
  const { locale, t } = useLangStore();
  const root = useRef<HTMLDivElement>(null);
  const [ownValue, setOwnValue] = useState("");
  const text = value ?? ownValue;
  const query = text.trim().toLowerCase();
  const queryKey = `${locale}:${query}`;
  const eligible = query.length >= 2 && query.length <= 80;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<Result | null>(null);
  const lastResult = useRef<Result | null>(null);
  const [loadingKey, setLoadingKey] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const products = result?.key === queryKey ? result.products : EMPTY_SUGGESTIONS;
  const expanded = open && eligible;
  const loading = expanded && loadingKey === queryKey;
  const failed = expanded && errorKey === queryKey;

  useEffect(() => {
    if (!open || !eligible || lastResult.current?.key === queryKey) return;
    const controller = new AbortController();
    setLoadingKey(queryKey);
    setErrorKey("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, locale });
        const response = await fetch(`/api/products/suggestions?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Suggestion request failed");
        const data = await response.json() as { products: Suggestion[] };
        if (controller.signal.aborted) return;
        const next = { key: queryKey, products: [...new Map(data.products.map((product) => [product.id, product])).values()].slice(0, 6) };
        lastResult.current = next;
        setResult(next);
      } catch {
        if (!controller.signal.aborted) setErrorKey(queryKey);
      } finally {
        if (!controller.signal.aborted) setLoadingKey("");
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [eligible, locale, open, query, queryKey]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setActive(-1); }
    };
    const closeWindow = () => { setOpen(false); setActive(-1); };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("blur", closeWindow);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("blur", closeWindow);
    };
  }, [open]);

  useEffect(() => {
    if (expanded && active >= 0 && products[active]) {
      document.getElementById(`${listId}-${products[active].id}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [active, expanded, listId, products]);

  const status = !expanded ? "" : loading ? t.searchSuggestions.loading : failed ? t.searchSuggestions.unavailable
    : result?.key === queryKey ? (products.length ? t.searchSuggestions.count.replace("{count}", String(products.length)) : t.searchSuggestions.empty) : "";

  return <div ref={root} className={cn("sf-search-autocomplete", className)}>
    <Search className="sf-search-icon" size={20} aria-hidden="true" />
    <input id={inputId} name="q" type="search" value={text} placeholder={placeholder} aria-label={label}
      className={inputClassName} autoComplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
      aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={expanded && active >= 0 && products[active] ? `${listId}-${products[active].id}` : undefined}
      onChange={(event) => {
        const next = event.target.value;
        setOwnValue(next); onValueChange?.(next); setActive(-1);
        setOpen(next.trim().length >= 2 && next.trim().length <= 80);
        if (!next.trim()) { lastResult.current = null; setResult(null); }
      }}
      onFocus={() => setOpen(eligible)}
      onBlur={(event) => {
        // A null relatedTarget can precede a touch click on an option; outside pointers/Tab close separately.
        if (event.relatedTarget && !root.current?.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        else if (event.key === "Tab") { setOpen(false); setActive(-1); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (eligible) setOpen(true);
          if (products.length) {
            event.preventDefault();
            setActive((index) => event.key === "ArrowDown" ? (index + 1) % products.length : (index <= 0 ? products.length - 1 : index - 1));
          }
        } else if (event.key === "Enter") {
          if (expanded && active >= 0 && products[active]) {
            event.preventDefault();
            router.push(`/product/${products[active].slug}`);
          }
          setOpen(false); setActive(-1);
        }
      }} />
    {expanded && <div className="sf-search-popover">
      <ul id={listId} role="listbox" aria-label={t.searchSuggestions.label} aria-busy={loading}>
        {products.map((product, index) => <li key={product.id} role="presentation">
          <Link href={`/product/${product.slug}`} prefetch={false} role="option" tabIndex={-1}
            id={`${listId}-${product.id}`} aria-selected={index === active} className="sf-search-suggestion"
            onMouseEnter={() => setActive(index)} onClick={() => { setOpen(false); setActive(-1); }}>
            <Thumbnail key={`${product.id}:${product.image}`} src={product.image} /><span>{product.name}</span>
          </Link>
        </li>)}
      </ul>
      {(loading || failed || products.length === 0) && <p className="sf-search-status">{status || t.searchSuggestions.loading}</p>}
    </div>}
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</span>
  </div>;
}
