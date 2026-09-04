"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SendNotificationForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setLoading(true);
    const supabase = createClient();

    const { data: userId, error: lookupError } = await supabase.rpc("find_profile_id_by_email", {
      p_email: email.trim(),
    });
    if (lookupError || !userId) {
      setLoading(false);
      setError("لا يوجد حساب مسجّل بهذا البريد الإلكتروني.");
      return;
    }

    const { error: insertError } = await supabase
      .from("notifications")
      .insert({ user_id: userId, type: "admin_message", title: title.trim(), body: body.trim() || null });
    setLoading(false);
    if (insertError) {
      setError("تعذّر إرسال الإشعار.");
      return;
    }
    setSent(true);
    setTitle("");
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        required
        type="email"
        placeholder="البريد الإلكتروني للمستلم"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <input
        required
        placeholder="عنوان الإشعار"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <textarea
        placeholder="نص الإشعار (اختياري)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
      />
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      {sent && <p className="text-xs text-primary font-bold">تم الإرسال.</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "إرسال"}
      </button>
    </form>
  );
}
