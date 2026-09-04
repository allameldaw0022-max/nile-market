import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Package, ClipboardList } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";

const TABS = [
  { href: "/seller", label: "لوحتي", icon: LayoutDashboard },
  { href: "/seller/products", label: "المنتجات", icon: Package },
  { href: "/seller/orders", label: "الطلبات", icon: ClipboardList },
];

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "seller" && user.role !== "admin") redirect("/account");

  return (
    <div className="flex-1 flex flex-col">
      <nav className="bg-white border-b border-black/5">
        <div className="max-w-4xl mx-auto flex gap-1 px-4 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
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
