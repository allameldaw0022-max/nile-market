import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Store, Layers, Receipt } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";

const TABS = [
  { href: "/admin", label: "لوحتي", icon: LayoutDashboard },
  { href: "/admin/stores", label: "المتاجر", icon: Store },
  { href: "/admin/plans", label: "الباقات", icon: Layers },
  { href: "/admin/subscription-requests", label: "طلبات الاشتراك", icon: Receipt },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/account");

  return (
    <div className="flex-1 flex flex-col">
      <nav className="bg-navy">
        <div className="max-w-5xl mx-auto flex gap-1 px-4 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-gold px-3 py-3 shrink-0"
            >
              <tab.icon size={14} /> {tab.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
