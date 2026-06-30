import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="container-shop flex flex-col items-center py-32 text-center">
      <CheckCircle2 size={56} className="text-pink-500" />
      <h1 className="mt-6 font-display text-3xl">Спасибо за заказ!</h1>
      {order && <p className="mt-2 text-ink/60">Номер заказа: {order}</p>}
      <p className="mt-2 max-w-md text-ink/60">
        Мы отправили подтверждение на ваш email. Скоро свяжемся с вами по поводу доставки.
      </p>
      <Link href="/catalog" className="mt-8">
        <Button size="lg">Продолжить покупки</Button>
      </Link>
    </div>
  );
}
