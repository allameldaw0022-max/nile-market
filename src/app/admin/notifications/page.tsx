import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SendNotificationForm } from "./SendNotificationForm";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, is_read, created_at, profiles!user_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">الإشعارات</h1>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-4">
        <p className="text-sm font-bold text-navy mb-3">إرسال إشعار لمستخدم</p>
        <SendNotificationForm />
      </div>

      {!notifications || notifications.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Bell className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد إشعارات مرسلة بعد.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
          {notifications.map((n) => (
            <div key={n.id} className="p-3.5 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-bold text-navy">{n.title}</p>
                <span className="text-[10px] text-neutral-400">{new Date(n.created_at).toLocaleDateString("ar")}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                إلى: {(n.profiles as { full_name: string | null } | null)?.full_name ?? "—"}
              </p>
              {n.body && <p className="text-xs text-neutral-400 mt-1">{n.body}</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
