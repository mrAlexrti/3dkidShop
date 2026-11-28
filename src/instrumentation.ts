export async function register() {
  // Next config validates both runtimes. Only Node has Prisma and the launcher preload.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resolveEnvironment } = await import("@/lib/environment.mjs");
    const target = resolveEnvironment(process.env);
    if (target.kind !== "ordinary") {
      const { verifyDevelopmentRuntime } = await import("./lib/dev-runtime");
      await verifyDevelopmentRuntime(target);
    }
  }
}
