import { createClient } from "@/lib/supabase/server";

export async function getMyStore() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("stores").select("*").eq("owner_id", user.id).maybeSingle();
  return data;
}

export async function getStoreStats(storeId: string) {
  const supabase = await createClient();

  const [{ count: productsCount }, { count: ordersCount }, { data: revenueRows }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("store_id", storeId),
    supabase.from("order_items").select("unit_price, quantity").eq("store_id", storeId).eq("status", "delivered"),
  ]);

  const revenue = (revenueRows ?? []).reduce((sum, r) => sum + r.unit_price * r.quantity, 0);

  return {
    productsCount: productsCount ?? 0,
    ordersCount: ordersCount ?? 0,
    revenue,
  };
}

export async function getStoreProductsAdmin(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, price, currency, stock, status, images")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getStoreOrderItems(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("id, quantity, unit_price, status, created_at, products(name), orders(delivery_address, customer_id)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
