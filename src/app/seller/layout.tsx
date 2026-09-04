import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Package, ClipboardList, CreditCard, Megaphone, Settings, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { getMyStoreContext } from "@/lib/queries/seller";

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getMyStoreContext();
  const hasStoreAccess = context !== null;
  if (user.role !== "seller" && user.role !== "admin" && !hasStoreAccess) redirect("/account");

  const isOwner = context?.isOwner ?? (user.role === "seller" || user.role === "admin");

  const tabs = [
    { href: "/seller", label: "لوحتي", icon: LayoutDashboard },
    { href: "/seller/products", label: "المنتجات", icon: Package },
    { href: "/seller/orders", label: "الطلبات", icon: ClipboardList },
    ...(isOwner
      ? [
          { href: "/seller/marketers", label: "مسوّقو متجري", icon: Megaphone },
          { href: "/seller/employees", label: "الموظفون", icon: Users },
          { href: "/seller/subscription", label: "الاشتراك", icon: CreditCard },
          { href: "/seller/settings", label: "الإعدادات", icon: Settings },
        ]
      : []),
  ];

  return (
    <div className="flex-1 flex flex-col">
      <nav className="bg-white border-b border-black/5">
        <div className="max-w-4xl mx-auto flex gap-1 px-4 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-primary px-3 py-3 shrink-0"
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
