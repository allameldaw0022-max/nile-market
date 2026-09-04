import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, ClipboardList, Wallet, Share2 } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";

const TABS = [
  { href: "/marketer/products", label: "سوّق واربح", icon: Share2 },
  { href: "/marketer", label: "طلب جديد", icon: Megaphone },
  { href: "/marketer/orders", label: "طلباتي", icon: ClipboardList },
  { href: "/marketer/earnings", label: "أرباحي", icon: Wallet },
];

export default async function MarketerLayout({ children }: LayoutProps<"/marketer">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "marketer" && user.role !== "admin") redirect("/account");

  return (
    <div className="flex-1 flex flex-col">
      <nav className="bg-white border-b border-black/5">
        <div className="max-w-3xl mx-auto flex gap-1 px-4 overflow-x-auto no-scrollbar">
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
