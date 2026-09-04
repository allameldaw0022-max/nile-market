"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type CartLine = {
  id: string;
  quantity: number;
  product_id: string;
  products: { id: string; name: string; price: number; currency: string; stock: number } | null;
};

export function CartPageClient({ initialLines }: { initialLines: CartLine[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>(initialLines);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState({ state: "", city: "", details: "" });

  async function updateQuantity(lineId: string, quantity: number) {
    const supabase = createClient();
    if (quantity <= 0) {
      const { error: deleteError } = await supabase.from("cart_items").delete().eq("id", lineId);
      if (!deleteError) setLines((prev) => prev.filter((l) => l.id !== lineId));
      return;
    }
    const { error: updateError } = await supabase.from("cart_items").update({ quantity }).eq("id", lineId);
    if (!updateError) {
      setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, quantity } : l)));
    }
  }

  async function removeLine(lineId: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("cart_items").delete().eq("id", lineId);
    if (!deleteError) setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  const subtotal = lines.reduce((sum, l) => sum + (l.products?.price ?? 0) * l.quantity, 0);

  async function checkout() {
    if (!address.state || !address.city) {
      setError("أدخل الولاية والمدينة أولاً.");
      return;
    }
    setError(null);
    setCheckingOut(true);
    const supabase = createClient();
    const { data: orderId, error: checkoutError } = await supabase.rpc("checkout_cart", {
      p_delivery_address: address,
      p_delivery_fee: 0,
    });
    setCheckingOut(false);
    if (checkoutError) {
      setError("تعذّر إتمام الطلب. حاول مرة أخرى.");
      return;
    }
    router.push(`/orders/${orderId}`);
  }

  if (lines.length === 0) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <ShoppingCart className="text-neutral-300 mb-3" size={40} />
        <p className="text-neutral-400 text-sm">سلتك فارغة.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-3">
      <h1 className="font-bold text-xl text-navy">السلة</h1>

      {lines.map((line) => (
        <div key={line.id} className="bg-white rounded-2xl border border-black/5 p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-navy truncate">{line.products?.name}</p>
            <p className="text-primary text-sm font-extrabold mt-1">
              {line.products?.price.toLocaleString("ar")} {line.products?.currency}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-neutral-50 rounded-xl px-2 py-1">
            <button onClick={() => updateQuantity(line.id, line.quantity - 1)} className="p-1">
              <Minus size={14} />
            </button>
            <span className="w-5 text-center text-sm font-bold">{line.quantity}</span>
            <button onClick={() => updateQuantity(line.id, line.quantity + 1)} className="p-1">
              <Plus size={14} />
            </button>
          </div>
          <button onClick={() => removeLine(line.id)} className="text-red-500 p-2">
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      <div className="bg-white rounded-2xl border border-black/5 p-4 space-y-2">
        <p className="text-sm font-bold text-navy">عنوان التوصيل</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="الولاية"
            value={address.state}
            onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
            className="rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            placeholder="المدينة"
            value={address.city}
            onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
            className="rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <input
          placeholder="تفاصيل العنوان (اختياري)"
          value={address.details}
          onChange={(e) => setAddress((a) => ({ ...a, details: e.target.value }))}
          className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between">
        <span className="text-sm text-neutral-500">الإجمالي</span>
        <span className="font-extrabold text-primary text-lg">{subtotal.toLocaleString("ar")} SDG</span>
      </div>

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

      <button
        onClick={checkout}
        disabled={checkingOut}
        className="w-full bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
      >
        {checkingOut ? "جارِ إتمام الطلب…" : "إتمام الطلب"}
      </button>
    </main>
  );
}
