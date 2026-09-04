import { redirect } from "next/navigation";
import { getMyStore } from "@/lib/queries/seller";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const store = await getMyStore();
  if (!store) redirect("/seller");

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">إضافة منتج</h1>
      <ProductForm storeId={store.id} />
    </main>
  );
}
