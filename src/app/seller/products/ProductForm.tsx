"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ExistingProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  status: "active" | "hidden" | "out_of_stock";
  images: unknown;
};

export function ProductForm({ storeId, product }: { storeId: string; product?: ExistingProduct }) {
  const router = useRouter();
  const existingImage = Array.isArray(product?.images) ? (product.images[0] as string | undefined) : undefined;

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [stock, setStock] = useState(product?.stock?.toString() ?? "0");
  const [category, setCategory] = useState(product?.category ?? "");
  const [imageUrl, setImageUrl] = useState(existingImage ?? "");
  const [status, setStatus] = useState(product?.status ?? "active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: Number(price),
      stock: Number(stock),
      category: category.trim() || null,
      images: imageUrl.trim() ? [imageUrl.trim()] : [],
      status,
    };

    const { error: saveError } = product
      ? await supabase.from("products").update(payload).eq("id", product.id)
      : await supabase.from("products").insert({ ...payload, store_id: storeId });

    setLoading(false);
    if (saveError) {
      setError("تعذّر حفظ المنتج. تحقق من البيانات وحاول مرة أخرى.");
      return;
    }
    router.push("/seller/products");
    router.refresh();
  }

  async function handleDelete() {
    if (!product) return;
    if (!confirm(`هل تريد حذف "${product.name}"؟`)) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.from("products").delete().eq("id", product.id);
    router.push("/seller/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-3">
      <input
        required
        placeholder="اسم المنتج"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
      />
      <textarea
        placeholder="وصف المنتج"
        value={description ?? ""}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary resize-none"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          type="number"
          min="0"
          step="0.01"
          placeholder="السعر (SDG)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <input
          required
          type="number"
          min="0"
          placeholder="الكمية المتوفرة"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <input
        placeholder="التصنيف (اختياري)"
        value={category ?? ""}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
      />
      <input
        placeholder="رابط صورة المنتج (اختياري)"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
      />

      {product && (
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary"
        >
          <option value="active">نشط (ظاهر للعملاء)</option>
          <option value="hidden">مخفي</option>
          <option value="out_of_stock">نفدت الكمية</option>
        </select>
      )}

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
        >
          {loading ? "..." : product ? "حفظ التعديلات" : "إضافة المنتج"}
        </button>
        {product && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="w-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </form>
  );
}
