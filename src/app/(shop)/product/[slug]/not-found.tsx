import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductNotFound() {
  return (
    <div className="container-shop flex flex-col items-center py-32 text-center">
      <h1 className="font-display text-4xl">Товар не найден</h1>
      <p className="mt-3 text-ink/60">Возможно, он был удалён или вы перешли по неверной ссылке.</p>
      <Link href="/catalog" className="mt-6">
        <Button>Вернуться в каталог</Button>
      </Link>
    </div>
  );
}
