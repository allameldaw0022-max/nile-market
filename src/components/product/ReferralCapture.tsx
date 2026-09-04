"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { captureReferralCode, getOrCreateVisitorId } from "@/lib/referral";

// Invisible: on a product page visited via ?ref=CODE, remember the code
// (survives a later login/signup redirect) and log one click for the
// marketer's stats. Never blocks rendering -- failures here are silent.
export function ReferralCapture({ productId }: { productId: string }) {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  useEffect(() => {
    if (!ref) return;
    captureReferralCode(ref);

    const supabase = createClient();
    supabase
      .rpc("resolve_marketer_code", { p_code: ref })
      .then(({ data: marketerId }) => {
        if (!marketerId) return;
        return supabase.from("product_marketer_clicks").insert({
          marketer_id: marketerId,
          product_id: productId,
          visitor_id: getOrCreateVisitorId(),
        });
      });
  }, [ref, productId]);

  return null;
}
