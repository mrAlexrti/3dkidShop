import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n-server";
import { getFontThemeId } from "@/lib/site-settings";
import { FONT_THEMES, googleFontsHref } from "@/lib/fonts";

export const metadata: Metadata = {
  title: {
    default:  "3D Kid — творчі 3D товари",
    template: "%s | 3D Kid",
  },
  description: "Магазин творчих товарів 3D Kid. Яскравий дизайн і швидка доставка.",
  metadataBase: new URL("https://www.3dkid.shop"),
  openGraph: {
    title:       "3D Kid — творчі 3D товари",
    description: "Наклей трохи радості!",
    type:        "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, fontThemeId] = await Promise.all([getLocale(), getFontThemeId()]);
  const fontTheme = FONT_THEMES[fontThemeId];

  const fontVars = {
    "--font-body": fontTheme.body,
    "--font-display": fontTheme.display,
  } as CSSProperties;

  return (
    // suppressHydrationWarning — устраняет Hydration Error от браузерных
    // расширений (LastPass, Bitwarden, Google Translate и пр.)
    <html
      lang={locale === "en" ? "en" : "uk"}
      style={fontVars}
      suppressHydrationWarning
    >
      <body className="grid-surface font-sans antialiased" suppressHydrationWarning>
        {/* Динамическая шрифтовая тема (выбирается в админке, хранится в SiteContent).
            React 19 хойстит эти <link> в <head> и дедуплицирует по href. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontsHref(fontThemeId)} precedence="default" />

        <Providers initialLocale={locale}>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
