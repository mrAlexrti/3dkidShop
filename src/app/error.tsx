"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-shop flex flex-col items-center py-32 text-center">
      <h1 className="font-display text-3xl">Что-то пошло не так</h1>
      <p className="mt-2 text-ink/60">Попробуйте обновить страницу</p>
      <Button className="mt-6" onClick={() => reset()}>
        Повторить
      </Button>
    </div>
  );
}
