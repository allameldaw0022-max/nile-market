import type { Metadata } from 'next';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { ErrorState } from '@/components/ui/States';
import { PlatformSettingsForm } from '@/components/admin/PlatformSettingsForm';

export const metadata: Metadata = {
  title: 'إعدادات المنصة — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type BankAccount = { bank: string; account: string; holder?: string };

/**
 * إعدادات المنصة.
 *
 * ★ بوابة الإطلاق التجاري (D31) يفرضها trigger في القاعدة: تفعيلها
 * بباقات غير مضبوطة يُرفض هناك. الصفحة تعرض السبب ولا تقرّر.
 */
export default async function AdminSettingsPage() {
  await requirePlatformAccess('settings', 'view');
  const actor = await getActor();
  const canManage = actor.kind === 'user' && adminHasLevel(actor, 'settings', 'manage');

  const supabase = await createClient();
  const [{ data, error }, { data: launch }] = await Promise.all([
    supabase.from('platform_settings')
      .select('maintenance_mode, maintenance_message, commercial_launch_enabled, grace_period_days, expiring_warning_days, default_partner_rate, support_email, bank_accounts, bankak_number, payment_instructions')
      .eq('id', true).maybeSingle(),
    supabase.rpc('plan_configuration_status').maybeSingle(),
  ]);
  if (error || !data) return <ErrorState description="تعذّر تحميل الإعدادات" />;

  const blockers: string[] = [];
  if (launch && !launch.complete) {
    for (const code of launch.unconfigured_prices ?? []) {
      blockers.push(`لم يُضبط سعر الباقة: ${code}`);
    }
    for (const key of launch.unconfigured_features ?? []) {
      blockers.push(`لم تُضبط الميزة: ${key}`);
    }
    if (!launch.admins_sufficient) {
      blockers.push(
        `حسابات الإدارة النشطة ${launch.active_admins} — فصل المهام يحتاج حسابين`);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">إعدادات المنصة</h1>
        <p className="text-sm text-sand-600">
          قيم تسري على كل المتاجر. لا يفترض النظام قيمة لم تضبطها (D18).
        </p>
      </div>

      <PlatformSettingsForm
        canManage={canManage}
        launchBlockers={blockers}
        settings={{
          maintenanceMode: data.maintenance_mode,
          maintenanceMessage: data.maintenance_message,
          commercialLaunchEnabled: data.commercial_launch_enabled,
          gracePeriodDays: data.grace_period_days,
          expiringWarningDays: data.expiring_warning_days,
          defaultPartnerRate: Number(data.default_partner_rate),
          supportEmail: data.support_email,
          bankAccounts: (data.bank_accounts ?? []) as BankAccount[],
          bankakNumber: data.bankak_number,
          paymentInstructions: data.payment_instructions,
        }}
      />
    </div>
  );
}
