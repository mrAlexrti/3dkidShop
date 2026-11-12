import { isTestModeEnabled } from "@/lib/server-env";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { getT } from "@/lib/i18n-server";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();

  return (
    <div className="admin-shell flex min-h-screen flex-col bg-cream lg:flex-row">
      <AdminSidebar />
      <div id="admin-content" className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-8">
        {isTestModeEnabled() && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
            {t.admin.testMode.title}
            <span className="mt-1 block text-xs font-normal text-amber-700">
              {t.admin.testMode.note}
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
