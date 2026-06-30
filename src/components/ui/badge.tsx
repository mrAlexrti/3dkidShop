import { cn } from "@/lib/utils";

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "glass-pink inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white",
        className
      )}
    >
      {children}
    </span>
  );
}
