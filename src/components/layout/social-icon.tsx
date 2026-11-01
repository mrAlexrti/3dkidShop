import { Instagram, Youtube } from "lucide-react";

export function SocialIcon({ network }: { network: "instagram" | "telegram" | "tiktok" | "youtube" }) {
  if (network === "instagram") return <Instagram size={23} aria-hidden="true" />;
  if (network === "youtube") return <Youtube size={25} aria-hidden="true" />;
  if (network === "telegram") return <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.6 3.5 18.4 20c-.2 1-1 1.2-1.8.7l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.3L6 13.5l-4.8-1.5c-1-.3-1-1 .2-1.5L20.1 3c.9-.3 1.7.2 1.5.5Z" />
  </svg>;
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3v12.5a4.5 4.5 0 1 1-4-4.47M14 3c.5 3.5 2.5 5.5 6 5.5" />
  </svg>;
}
