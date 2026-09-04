"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Store = { id: string; name: string };
type Product = { id: string; name: string; price: number; currency: string };

export function NewMarketerOrderForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    const supabase = createClient();
    supabase
      .from("products")
      .select("id, name, price, currency")
      .eq("store_id", storeId)
      .eq("status", "active")
      .then(({ data }) => {
        setProducts(data ?? []);
        setProductId(data?.[0]?.id ?? "");
      });
  }, [storeId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!storeId || !productId) {
      setError("اختر المتجر والمنتج أولاً.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: orderId, error: rpcError } = await supabase.rpc("create_marketer_order", {
      p_store_id: storeId,
      p_product_id: productId,
      p_quantity: Number(quantity),
      p_guest_name: guestName.trim(),
      p_guest_phone: guestPhone.trim(),
      p_delivery_address: { state, city, details: "" },
      p_options: notes.trim() ? { notes: notes.trim() } : {},
    });
    setLoading(false);
    if (rpcError) {
      setError("تعذّر إنشاء الطلب. تحقق من البيانات وحاول مرة أخرى.");
      return;
    }
    setDone(orderId as string);
    setGuestName("");
    setGuestPhone("");
    setState("");
    setCity("");
    setNotes("");
    setQuantity("1");
    router.refresh();
  }

  if (stores.length === 0) {
    return <p className="text-sm text-neutral-400 text-center">لا توجد متاجر نشطة حاليًا.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
      {done && (
        <div className="bg-primary/10 text-primary rounded-xl p-3 text-sm text-center font-bold">
          تم إنشاء الطلب بنجاح — رقم الطلب #{done.slice(0, 8)}
        </div>
      )}

      <label className="block text-xs font-bold text-neutral-500">المتجر</label>
      <select
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="block text-xs font-bold text-neutral-500">المنتج</label>
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        {products.length === 0 && <option value="">لا توجد منتجات في هذا المتجر</option>}
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.price.toLocaleString("ar")} {p.currency}
          </option>
        ))}
      </select>

      <input
        required
        type="number"
        min="1"
        placeholder="الكمية"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />

      <div className="border-t border-black/5 pt-3 space-y-3">
        <p className="text-xs font-bold text-neutral-500">بيانات العميل</p>
        <input
          required
          placeholder="اسم العميل"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          required
          placeholder="رقم هاتف العميل"
          value={guestPhone}
          onChange={(e) => setGuestPhone(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            placeholder="الولاية"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            required
            placeholder="المدينة"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <textarea
          placeholder="ملاحظات (اختياري)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

      <button
        type="submit"
        disabled={loading || !productId}
        className="w-full bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "إرسال الطلب"}
      </button>
    </form>
  );
}
