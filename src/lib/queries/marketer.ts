import { createClient } from "@/lib/supabase/server";

export async function getActiveStoresList() {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("id, name").eq("status", "active").order("name");
  return data ?? [];
}

export async function getMarketerOrderItems() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("order_items")
    .select(
      "id, quantity, unit_price, status, commission_amount, commission_paid, order_source, created_at, products(name), stores(name), orders(guest_customer_name, guest_customer_phone)"
    )
    .eq("marketer_id", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getMarketerEarningsSummary() {
  const items = await getMarketerOrderItems();

  let pending = 0;
  let earnedUnpaid = 0;
  let paid = 0;

  for (const item of items) {
    if (item.status === "cancelled") continue;
    if (item.status !== "delivered") {
      pending += item.commission_amount;
    } else if (item.commission_paid) {
      paid += item.commission_amount;
    } else {
      earnedUnpaid += item.commission_amount;
    }
  }

  return { pending, earnedUnpaid, paid };
}
