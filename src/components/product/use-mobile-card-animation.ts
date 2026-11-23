"use client";
import { useEffect, useState, type RefObject } from "react";
import { registerMobileAnimation } from "@/lib/mobile-card-animation";

export function useMobileCardAnimation(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    return registerMobileAnimation(ref.current, setActive);
  }, [ref, enabled]);
  return enabled && active;
}
