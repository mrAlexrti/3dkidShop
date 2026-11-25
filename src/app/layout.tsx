import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n-server";
import { getFontThemeId, getSiteDisplayName } from "@/lib/site-settings";
import { FONT_THEMES, googleFontsHref } from "@/lib/fonts";
import { faviconPath, siteOrigin } from "@/lib/seo-config";

export async function generateMetadata(): Promise<Metadata> {
  const name = await getSiteDisplayName();
  return {
    title: { default: name, template: `%s | ${name}` },
    applicationName: name,
    metadataBase: new URL(siteOrigin),
    icons: {
      icon: [
        { url: faviconPath, sizes: "96x96", type: "image/png" },
        { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon.ico", sizes: "16x16 32x32 48x48 96x96", type: "image/x-icon" },
      ],
      apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    },
  };
}

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
