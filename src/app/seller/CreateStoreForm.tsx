"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";

export function CreateStoreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: insertError } = await supabase.from("stores").insert({
      owner_id: user.id,
      name: name.trim(),
      slug: slugify(name),
      description: description.trim() || null,
    });

    setLoading(false);
    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "اسم المتجر هذا مستخدم بالفعل. اختر اسمًا آخر."
          : "تعذّر إنشاء المتجر. حاول مرة أخرى."
      );
      return;
    }
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="max-w-sm w-full bg-white rounded-2xl border border-black/5 p-8 space-y-3">
        <Store className="mx-auto text-primary mb-1" size={32} />
        <h1 className="font-bold text-lg text-navy text-center">أنشئ متجرك</h1>
        <p className="text-xs text-neutral-400 text-center mb-4">
          متجرك بانتظار المراجعة من الإدارة قبل الظهور للعملاء
        </p>

        <input
          required
          placeholder="اسم المتجر"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <textarea
          placeholder="وصف مختصر للمتجر (اختياري)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary resize-none"
        />

        {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
        >
          {loading ? "..." : "إنشاء المتجر"}
        </button>
      </form>
    </main>
  );
}
