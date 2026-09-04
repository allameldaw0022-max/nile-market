import { getActiveStoresList } from "@/lib/queries/marketer";
import { NewMarketerOrderForm } from "./NewMarketerOrderForm";

export default async function MarketerNewOrderPage() {
  const stores = await getActiveStoresList();

  return (
    <main className="flex-1 max-w-lg mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">إنشاء طلب لعميل</h1>
      <NewMarketerOrderForm stores={stores} />
    </main>
  );
}
