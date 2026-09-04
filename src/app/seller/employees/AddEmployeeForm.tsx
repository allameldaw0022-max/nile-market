"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddEmployeeForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { data: profileId, error: lookupError } = await supabase.rpc("find_profile_id_by_email", {
      p_email: email.trim(),
    });

    if (lookupError || !profileId) {
      setLoading(false);
      setError("لا يوجد حساب مسجّل بهذا البريد الإلكتروني.");
      return;
    }

    const { error: insertError } = await supabase
      .from("store_employees")
      .insert({ store_id: storeId, profile_id: profileId });
    setLoading(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "هذا الشخص موظف بالفعل في متجرك." : "تعذّرت الإضافة.");
      return;
    }
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          required
          type="email"
          placeholder="البريد الإلكتروني للموظف"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white text-sm font-bold px-4 rounded-xl disabled:opacity-50"
        >
          {loading ? "..." : "إضافة"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
    </form>
  );
}
