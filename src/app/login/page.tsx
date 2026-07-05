import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { isTestModeEnabled } from "@/lib/server-env";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container-shop py-20 text-center">Завантаження...</div>}>
      <LoginForm isTestMode={isTestModeEnabled()} />
    </Suspense>
  );
}