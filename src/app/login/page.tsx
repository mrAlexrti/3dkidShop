"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@stikr.shop");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      toast.error("Неверный email или пароль");
    } else {
      router.push(searchParams.get("callbackUrl") ?? "/admin");
    }
  };

  return (
    <div className="container-shop flex min-h-[70vh] items-center justify-center py-20">
      <form onSubmit={onSubmit} className="glass w-full max-w-sm rounded-xl2 p-8 shadow-soft">
        <h1 className="font-display text-2xl">Вход в админ-панель</h1>

        <div className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
          />

          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
          />
        </div>

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
          {loading ? "Вход..." : "Войти"}
        </Button>

        <p className="mt-4 text-center text-xs text-ink/40">
          Демо-доступ: admin@stikr.shop / admin12345
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container-shop py-20 text-center">Загрузка...</div>}>
      <LoginContent />
    </Suspense>
  );
}