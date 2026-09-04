import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { CartPageClient, type CartLine } from "./CartPageClient";

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("cart_items")
    .select("id, quantity, product_id, products(id, name, price, currency, stock)")
    .order("created_at", { ascending: true });

  return <CartPageClient initialLines={(data ?? []) as CartLine[]} />;
}
