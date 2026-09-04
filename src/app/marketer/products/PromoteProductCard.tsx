"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Copy, Check, MessageCircle, Facebook, Send, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: string;
  name: string;
  price: number;
  currency: string;
  images: unknown;
  storeName: string;
  commissionRate: number;
};

export function PromoteProductCard({ product }: { product: Product }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("marketer_code").eq("id", user.id).maybeSingle();
      if (data?.marketer_code) setCode(data.marketer_code);
    });
  }, []);

  const firstImage = Array.isArray(product.images) ? (product.images[0] as string | undefined) : undefined;
  const commission = Math.round((product.price * product.commissionRate) / 100);
  const link = code && typeof window !== "undefined" ? `${window.location.origin}/product/${product.id}?ref=${code}` : "";
  const message = `شوف المنتج ده في سوق النيل 👇\n${product.name}\n${link}`;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="w-16 h-16 rounded-xl bg-neutral-50 flex items-center justify-center shrink-0 overflow-hidden">
          {firstImage ? (
            <Image src={firstImage} alt={product.name} width={64} height={64} className="object-cover w-full h-full" />
          ) : (
            <Package className="text-neutral-300" size={20} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy truncate">{product.name}</p>
          <p className="text-xs text-neutral-400 truncate">{product.storeName}</p>
          <p className="text-sm font-extrabold text-primary mt-1">
            {product.price.toLocaleString("ar")} {product.currency}
          </p>
          <p className="text-[11px] font-bold text-gold-dark">
            عمولتك: {commission.toLocaleString("ar")} {product.currency} ({product.commissionRate}%)
          </p>
        </div>
      </div>

      {code && (
        <div className="border-t border-black/5 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-xl border border-black/10 bg-neutral-50 px-2.5 py-1.5 text-[11px] outline-none"
            />
            <button onClick={copyLink} className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 bg-emerald-500 text-white text-[11px] font-bold py-2 rounded-xl"
            >
              <MessageCircle size={12} /> واتساب
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 bg-blue-600 text-white text-[11px] font-bold py-2 rounded-xl"
            >
              <Facebook size={12} /> فيسبوك
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(product.name)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 bg-sky-500 text-white text-[11px] font-bold py-2 rounded-xl"
            >
              <Send size={12} /> تيليجرام
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
