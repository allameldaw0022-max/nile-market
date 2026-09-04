import { createClient } from "@/lib/supabase/server";

export async function getAdminStats() {
  const supabase = await createClient();

  const [{ count: storesCount }, { count: pendingStoresCount }, { count: ordersCount }, { count: customersCount }] =
    await Promise.all([
      supabase.from("stores").select("id", { count: "exact", head: true }),
      supabase.from("stores").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    ]);

  return {
    storesCount: storesCount ?? 0,
    pendingStoresCount: pendingStoresCount ?? 0,
    ordersCount: ordersCount ?? 0,
    customersCount: customersCount ?? 0,
  };
}

export async function getAllStores() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getAllPlans() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_trial", false)
    .order("price", { ascending: true });
  return data ?? [];
}

export async function getCustomers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, phone, created_at")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function getAllOrders() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("id, quantity, unit_price, status, created_at, products(name), stores(name), orders(guest_customer_name, customer_id)")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function getAllProducts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, price, currency, status, stock, stores(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function getAllStoreEmployees() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_employees")
    .select("id, created_at, stores(name), profiles(full_name)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getPlatformMarketers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_marketers")
    .select("id, profile_id, referral_code, is_active, created_at, profiles(full_name)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getEligibleMarketerProfiles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "marketer")
    .order("full_name");
  return data ?? [];
}

export async function getPendingWithdrawalRequests() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketer_withdrawal_requests")
    .select("id, amount, status, created_at, profiles!marketer_id(full_name)")
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getPendingSubscriptionRequests() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_requests")
    .select("id, amount, payment_proof_url, status, created_at, stores(name), subscription_plans(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return data ?? [];
}
