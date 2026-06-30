import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col items-center justify-center bg-cream text-center">
        <h1 className="font-display text-4xl">404</h1>
        <p className="mt-2 text-ink/60">Страница не найдена</p>
        <Link href="/" className="mt-6">
          <Button>На главную</Button>
        </Link>
      </body>
    </html>
  );
}
