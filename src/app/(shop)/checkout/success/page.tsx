"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";

function SuccessContent() {
  const { t } = useLangStore();
  const searchParams = useSearchParams();
  const order = searchParams.get("order");

  return (
    <div className="container-shop flex flex-col items-center py-32 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <CheckCircle2 size={72} className="text-pink-500" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="mt-6 font-display text-3xl">{t.success.title}</h1>
        {order && (
          <p className="mt-3 text-sm text-ink/60">
            {t.success.order}{" "}
            <span className="font-semibold text-ink">{order}</span>
          </p>
        )}
        <p className="mt-3 max-w-md text-ink/60">{t.success.desc}</p>
        <Link href="/catalog" className="mt-8 inline-block">
          <Button size="lg">{t.success.continue}</Button>
        </Link>
      </motion.div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="container-shop py-32 text-center text-ink/40">
          <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-pink-100" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
