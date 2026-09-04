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
      "id, quantity, unit_price, status, commission_amount, order_source, created_at, products(name), stores(name), orders(guest_customer_name, guest_customer_phone)"
    )
    .eq("marketer_id", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getMarketerPendingCommission() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase
    .from("order_items")
    .select("commission_amount")
    .eq("marketer_id", user.id)
    .not("status", "in", "(delivered,cancelled)");

  return (data ?? []).reduce((sum, row) => sum + row.commission_amount, 0);
}
