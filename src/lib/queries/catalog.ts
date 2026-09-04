import { createClient } from "@/lib/supabase/server";

export async function getActiveStores() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, slug, logo_url, description")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getStoreBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, slug, logo_url, description, status")
    .ilike("slug", slug)
    .maybeSingle();
  return data;
}

export async function getStoreProducts(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, price, currency, images, stock, status")
    .eq("store_id", storeId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getProduct(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, description, price, currency, images, stock, status, store_id, stores(name, slug)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
