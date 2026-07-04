"use server";

import { auth } from "@/lib/auth";

export async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}
