import { redirect } from "next/navigation";
import { getMyStore } from "@/lib/queries/seller";
import { StoreSettingsForm } from "./StoreSettingsForm";

export default async function SellerSettingsPage() {
  const store = await getMyStore();
  if (!store) redirect("/seller");

  return (
    <main className="flex-1 max-w-lg mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">إعدادات المتجر</h1>
      <StoreSettingsForm store={store} />
    </main>
  );
}
