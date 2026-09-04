"use client";

import { useEffect, useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function MarketerShareBar({ productId, productName }: { productId: string; productName: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role, marketer_code").eq("id", user.id).maybeSingle();
      if (data?.role === "marketer" && data.marketer_code) setCode(data.marketer_code);
    });
  }, []);

  if (!code) return null;

  const link = `${window.location.origin}/product/${productId}?ref=${code}`;
  const message = `شوف المنتج ده في سوق النيل 👇\n${productName}\n${link}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable -- the link is still shown/selectable in the input
    }
  }

  return (
    <div className="mt-3 bg-gold/10 border border-gold/30 rounded-2xl p-3">
      <p className="text-xs font-bold text-gold-dark mb-2">سوّق واربح — رابطك الخاص لهذا المنتج</p>
      <div className="flex gap-2 mb-2">
        <input
          readOnly
          value={link}
          onClick={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs outline-none"
        />
        <button onClick={copyLink} className="shrink-0 w-9 h-9 rounded-xl bg-gold text-navy flex items-center justify-center">
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl"
      >
        <MessageCircle size={14} /> مشاركة عبر واتساب
      </a>
    </div>
  );
}
