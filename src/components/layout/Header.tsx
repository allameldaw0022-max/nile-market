import Link from "next/link";
import { LogIn, LogOut, LayoutDashboard, ShoppingCart, ClipboardList, Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { signOutAction } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SITE_NAME } from "@/lib/site";

export async function Header() {
  const user = await getCurrentUser();
  const dashboardHref =
    user?.role === "admin" ? "/admin" : user?.role === "seller" ? "/seller" : user?.role === "marketer" ? "/marketer" : "/account";

  let unreadCount = 0;
  if (user) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    unreadCount = count ?? 0;
  }

  return (
    <header className="sticky top-0 z-40 bg-navy text-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-extrabold text-lg">
          {SITE_NAME}
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <Link href="/notifications" className="relative text-white/80 hover:text-white">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -left-1.5 bg-gold text-navy text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link href="/orders" className="text-white/80 hover:text-white">
              <ClipboardList size={18} />
            </Link>
            <Link href="/cart" className="text-white/80 hover:text-white">
              <ShoppingCart size={18} />
            </Link>
            <Link
              href={dashboardHref}
              className="flex items-center gap-1.5 text-xs font-bold bg-white/10 px-3 py-2 rounded-xl hover:bg-white/20"
            >
              <LayoutDashboard size={14} /> لوحتي
            </Link>
            <form action={signOutAction}>
              <button className="flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-white">
                <LogOut size={14} /> خروج
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-xs font-bold bg-gold text-navy px-3 py-2 rounded-xl"
          >
            <LogIn size={14} /> تسجيل الدخول
          </Link>
        )}
      </div>
    </header>
  );
}
