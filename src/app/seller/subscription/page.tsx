import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { getMyStore } from "@/lib/queries/seller";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionRequestForm } from "./SubscriptionRequestForm";

export default async function SellerSubscriptionPage() {
  const store = await getMyStore();
  if (!store) redirect("/seller");

  const supabase = await createClient();
  const [{ data: subscription }, { data: plans }, { data: pendingRequest }] = await Promise.all([
    supabase
      .from("seller_subscriptions")
      .select("status, started_at, expires_at, subscription_plans(name)")
      .eq("store_id", store.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("subscription_plans").select("id, name, price, duration_days").eq("is_active", true),
    supabase
      .from("subscription_requests")
      .select("id")
      .eq("store_id", store.id)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">الاشتراك</h1>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-4 flex items-center gap-3">
        <CreditCard className="text-primary" size={24} />
        <div>
          {subscription ? (
            <>
              <p className="text-sm font-bold text-navy">
                {(subscription.subscription_plans as { name: string } | null)?.name}
              </p>
              <p className="text-xs text-neutral-400">
                ينتهي في {new Date(subscription.expires_at).toLocaleDateString("ar")} — {subscription.status === "active" ? "نشط" : subscription.status}
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-400">لا يوجد اشتراك حالي.</p>
          )}
        </div>
      </div>

      {pendingRequest ? (
        <div className="bg-amber-500/10 text-amber-700 rounded-2xl p-4 text-sm text-center">
          لديك طلب تجديد قيد المراجعة من الإدارة.
        </div>
      ) : (
        <SubscriptionRequestForm storeId={store.id} plans={plans ?? []} />
      )}
    </main>
  );
}
