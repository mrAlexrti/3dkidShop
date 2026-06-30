import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-cream">
      <AdminSidebar />
      <div className="flex-1 overflow-y-auto p-8">{children}</div>
    </div>
  );
}
