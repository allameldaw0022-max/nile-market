import { getPlatformSettings } from "@/lib/queries/admin";
import { PlatformSettingsForm } from "./PlatformSettingsForm";

export default async function AdminSettingsPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">إعدادات المنصة</h1>
      <PlatformSettingsForm
        defaultRate={settings?.default_platform_commission_rate ?? 5}
      />
      <p className="text-xs text-neutral-400 mt-3">
        هذه النسبة تُطبَّق تلقائيًا على أي متجر جديد عند إنشائه، ويمكنك تعديل نسبة متجر معيّن لاحقًا من صفحة{" "}
        <span className="font-bold text-navy">المتاجر</span>. لا تتأثر الطلبات السابقة بأي تغيير لاحق في النسبة.
      </p>
    </main>
  );
}
