import { getPlatformSettings, getAllPayoutMethods } from "@/lib/queries/admin";
import { PlatformSettingsForm } from "./PlatformSettingsForm";
import { PayoutMethodsManager } from "./PayoutMethodsManager";

export default async function AdminSettingsPage() {
  const [settings, payoutMethods] = await Promise.all([getPlatformSettings(), getAllPayoutMethods()]);

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

      <h2 className="font-bold text-lg text-navy mt-8 mb-3">طرق السحب</h2>
      <PayoutMethodsManager methods={payoutMethods} />
    </main>
  );
}
