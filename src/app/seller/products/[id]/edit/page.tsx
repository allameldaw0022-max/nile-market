import { notFound, redirect } from "next/navigation";
import { getMyStore } from "@/lib/queries/seller";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../../ProductForm";

export default async function EditProductPage({ params }: PageProps<"/seller/products/[id]/edit">) {
  const { id } = await params;
  const store = await getMyStore();
  if (!store) redirect("/seller");

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name, description, price, stock, category, status, images")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();

  if (!product) notFound();

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">تعديل المنتج</h1>
      <ProductForm storeId={store.id} product={product} />
    </main>
  );
}
