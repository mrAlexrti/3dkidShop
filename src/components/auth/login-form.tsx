"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Невірний логін або пароль",
  invalid_totp: "Невірний код Google Authenticator",
  admin_config_missing: "Авторизацію адміністратора не налаштовано на сервері",
  CredentialsSignin: "Невірні дані для входу",
};

function getSafeCallbackUrl(value: string | null) {
  return value?.startsWith("/") ? value : "/admin";
}

export function LoginForm({ isTestMode }: { isTestMode: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(isTestMode ? "admin" : "");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));
    const response = await signIn("credentials", {
      username,
      password,
      totp,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (response?.error) {
      const message = AUTH_ERROR_MESSAGES[response.code ?? response.error] ?? "Не вдалося увійти";
      setError(message);
      toast.error(message);
      return;
    }

    router.replace(callbackUrl);
    router.refresh();
  };

  return (
    <div className="container-shop flex min-h-[70vh] items-center justify-center py-20">
      <form onSubmit={onSubmit} className="glass w-full max-w-sm rounded-xl2 p-8 shadow-soft">
        <h1 className="font-display text-2xl">Вхід в адмін-панель</h1>

        {isTestMode && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            ВНИМАНИЕ: включен TEST_MODE
            <span className="mt-1 block text-xs font-normal text-amber-700">
              Тестовый вход: admin / Pass12345. Используйте только для разработки и тестирования.
            </span>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <input
            type="text"
            placeholder="Логін адміністратора"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
          />

          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
          />

          {!isTestMode && (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Код Google Authenticator"
              value={totp}
              onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            />
          )}
        </div>

        {error && <p className="mt-4 rounded-xl bg-pink-50 px-4 py-2 text-sm text-pink-600">{error}</p>}

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
          {loading ? "Вхід..." : "Увійти"}
        </Button>
      </form>
    </div>
  );
}