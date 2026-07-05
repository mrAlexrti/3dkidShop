import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

function isTestMode() {
  const value = process.env.TEST_MODE?.trim() ?? "";
  return value.replace(/^['"]|['"]$/g, "") === "1";
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container-shop py-20 text-center">Завантаження...</div>}>
      <LoginForm isTestMode={isTestMode()} />
    </Suspense>
  );
}