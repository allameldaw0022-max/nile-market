"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = { id: string; full_name: string | null };

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function AddPlatformMarketerForm({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [code, setCode] = useState(randomCode());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profileId) {
      setError("لا يوجد حساب مسوّق متاح للإضافة.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("platform_marketers")
      .insert({ profile_id: profileId, referral_code: code });
    setLoading(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "كود الإحالة مستخدم بالفعل." : "تعذّرت الإضافة.");
      return;
    }
    setCode(randomCode());
    router.refresh();
  }

  if (profiles.length === 0) {
    return <p className="text-xs text-neutral-400">لا يوجد حسابات &quot;مسوّق&quot; متاحة حاليًا لإضافتها للبرنامج.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-2">
      <select
        value={profileId}
        onChange={(e) => setProfileId(e.target.value)}
        className="col-span-3 sm:col-span-2 rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.id}
          </option>
        ))}
      </select>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary font-bold text-center"
      />
      {error && <p className="col-span-3 text-xs text-red-500 font-bold">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="col-span-3 bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "إضافة للبرنامج"}
      </button>
    </form>
  );
}
