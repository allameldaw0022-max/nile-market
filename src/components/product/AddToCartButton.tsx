"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getStoredReferralCode } from "@/lib/referral";

export function AddToCartButton({ productId, outOfStock }: { productId: string; outOfStock: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function addToCart() {
    setState("loading");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: existing } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("customer_id", user.id)
      .eq("product_id", productId)
      .eq("options", {})
      .maybeSingle();

    let referredByMarketerId: string | null = null;
    const refCode = getStoredReferralCode();
    if (refCode) {
      const { data } = await supabase.rpc("resolve_marketer_code", { p_code: refCode });
      referredByMarketerId = data ?? null;
    }

    const { error } = existing
      ? await supabase.from("cart_items").update({ quantity: existing.quantity + 1 }).eq("id", existing.id)
      : await supabase
          .from("cart_items")
          .insert({ customer_id: user.id, product_id: productId, quantity: 1, referred_by_marketer_id: referredByMarketerId });

    setState(error ? "error" : "done");
    if (!error) router.refresh();
  }

  return (
    <button
      onClick={addToCart}
      disabled={outOfStock || state === "loading"}
      className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
    >
      {state === "done" ? <Check size={18} /> : <ShoppingCart size={18} />}
      {outOfStock ? "نفدت الكمية" : state === "done" ? "أُضيف للسلة" : "أضف إلى السلة"}
    </button>
  );
}
