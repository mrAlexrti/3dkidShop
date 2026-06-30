import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: {
    default: "STIKR — Стикеры, постеры и мерч",
    template: "%s | STIKR",
  },
  description:
    "Интернет-магазин стикеров, постеров, открыток и мерча. Яркий дизайн, быстрая доставка.",
  metadataBase: new URL("https://stikr.shop"),
  openGraph: {
    title: "STIKR — Стикеры, постеры и мерч",
    description: "Наклей немного радости.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${fraunces.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
