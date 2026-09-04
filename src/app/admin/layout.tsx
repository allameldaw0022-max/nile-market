import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Store, Layers, Receipt, Star, Wallet, Users, ClipboardList, Package, Bell, UserCog, Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";

const TABS = [
  { href: "/admin", label: "لوحتي", icon: LayoutDashboard },
  { href: "/admin/stores", label: "المتاجر", icon: Store },
  { href: "/admin/customers", label: "العملاء", icon: Users },
  { href: "/admin/orders", label: "الطلبات", icon: ClipboardList },
  { href: "/admin/products", label: "المنتجات", icon: Package },
  { href: "/admin/plans", label: "الباقات", icon: Layers },
  { href: "/admin/subscription-requests", label: "طلبات الاشتراك", icon: Receipt },
  { href: "/admin/withdrawals", label: "طلبات السحب", icon: Wallet },
  { href: "/admin/marketers-50", label: "مسوّقو الـ50", icon: Star },
  { href: "/admin/employees", label: "الموظفون", icon: UserCog },
  { href: "/admin/notifications", label: "الإشعارات", icon: Bell },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
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
