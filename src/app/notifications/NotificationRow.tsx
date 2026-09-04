"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationRow({ notification }: { notification: Notification }) {
  const [isRead, setIsRead] = useState(notification.is_read);

  async function markRead() {
    if (isRead) return;
    setIsRead(true);
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id);
  }

  return (
    <button
      onClick={markRead}
      className={`w-full text-right rounded-2xl border p-4 transition-colors ${
        isRead ? "bg-white border-black/5" : "bg-primary/5 border-primary/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-sm ${isRead ? "font-bold text-navy" : "font-extrabold text-primary"}`}>
          {notification.title}
        </p>
        {!isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
      </div>
      {notification.body && <p className="text-xs text-neutral-500 mt-1">{notification.body}</p>}
      <p className="text-[10px] text-neutral-400 mt-1.5">{new Date(notification.created_at).toLocaleDateString("ar")}</p>
    </button>
  );
}
