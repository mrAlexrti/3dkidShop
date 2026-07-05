import { isTestModeEnabled } from "@/lib/server-env";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-cream">
      <AdminSidebar />
      <div className="flex-1 overflow-y-auto p-8">
        {isTestModeEnabled() && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
            ВНИМАНИЕ: включен TEST_MODE
            <span className="mt-1 block text-xs font-normal text-amber-700">
              Тестовый режим разрешен только для разработки и проверки. Перед production выставьте TEST_MODE=0.
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}