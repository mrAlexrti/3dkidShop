import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";

const manrope  = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });
const fraunces = Fraunces({ subsets: ["latin"],            variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: {
    default:  "3D Kid — Іграшки, брелоки та курси",
    template: "%s | 3D Kid",
  },
  description: "Магазин 3D Kid: іграшки, брелоки, курси. Яскравий дизайн, швидка доставка.",
  metadataBase: new URL("https://3dkid-shop-y8ut.vercel.app"),
  openGraph: {
    title:       "3D Kid — Іграшки, брелоки та курси",
    description: "Наклей трохи радості!",
    type:        "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning — устраняет Hydration Error от браузерных
    // расширений (LastPass, Bitwarden, Google Translate и пр.)
    <html lang="uk" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${fraunces.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
