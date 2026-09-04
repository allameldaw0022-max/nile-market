import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export async function getMyStore() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("stores").select("*").eq("owner_id", user.id).maybeSingle();
  return data;
}

// Resolves the store this user can operate on, whether they own it or are
// a granted employee of it (see store_employees). Employees never see
// financial/settings pages -- callers must check isOwner before rendering
// those.
export async function getMyStoreContext() {
  const owned = await getMyStore();
  if (owned) return { store: owned, isOwner: true as const };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employeeRow } = await supabase
    .from("store_employees")
    .select("stores(*)")
    .eq("profile_id", user.id)
    .maybeSingle();

  const store = employeeRow?.stores as Tables<"stores"> | undefined;
  if (!store) return null;
  return { store, isOwner: false as const };
}

export async function getStoreStats(storeId: string) {
  const supabase = await createClient();

  const [{ count: productsCount }, { count: ordersCount }, { data: revenueRows }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("store_id", storeId),
    supabase
      .from("order_items")
      .select("unit_price, quantity, commission_amount, platform_commission_amount")
      .eq("store_id", storeId)
      .eq("status", "delivered"),
  ]);

  const revenue = (revenueRows ?? []).reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  const netEarnings = (revenueRows ?? []).reduce(
    (sum, r) => sum + (r.unit_price * r.quantity - r.commission_amount - r.platform_commission_amount),
    0
  );

  return {
    productsCount: productsCount ?? 0,
    ordersCount: ordersCount ?? 0,
    revenue,
    netEarnings,
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

export async function getStoreMarketerStats(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("quantity, unit_price, status, commission_amount, marketer_id, order_source, profiles:marketer_id(full_name)")
    .eq("store_id", storeId)
    .not("marketer_id", "is", null);

  type Row = {
    quantity: number;
    unit_price: number;
    status: string;
    commission_amount: number;
    marketer_id: string;
    order_source: string;
    profiles: { full_name: string | null } | null;
  };

  const byMarketer = new Map<
    string,
    {
      name: string;
      orders: number;
      completed: number;
      cancelled: number;
      totalSales: number;
      commission: number;
      viaLink: number;
      viaAssisted: number;
    }
  >();

  for (const row of (data ?? []) as unknown as Row[]) {
    const marketerId = row.marketer_id;
    if (!marketerId) continue;
    const entry = byMarketer.get(marketerId) ?? {
      name: row.profiles?.full_name ?? "مسوّق",
      orders: 0,
      completed: 0,
      cancelled: 0,
      totalSales: 0,
      commission: 0,
      viaLink: 0,
      viaAssisted: 0,
    };
    entry.orders += 1;
    if (row.order_source === "affiliate_link") entry.viaLink += 1;
    if (row.order_source === "affiliate_assisted") entry.viaAssisted += 1;
    if (row.status === "delivered") {
      entry.completed += 1;
      entry.totalSales += row.unit_price * row.quantity;
      entry.commission += row.commission_amount;
    } else if (row.status === "cancelled") {
      entry.cancelled += 1;
    }
    byMarketer.set(marketerId, entry);
  }

  return Array.from(byMarketer.entries()).map(([id, stats]) => ({ id, ...stats }));
}

export async function getStoreOrderItems(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select(
      "id, quantity, unit_price, status, created_at, order_source, marketer_id, commission_amount, platform_commission_amount, products(name), orders(delivery_address, customer_id, guest_customer_name, guest_customer_phone), profiles:marketer_id(full_name)"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
