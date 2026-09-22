import type { Metadata } from 'next';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { PlanEditor, type EntitlementRow, type PlanRow } from '@/components/admin/PlanEditor';

export const metadata: Metadata = {
  title: 'الباقات — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** وصف كل مفتاح: الحدود رقمية والميزات منطقية. */
const FEATURES: Record<string, { label: string; kind: 'limit' | 'bool' }> = {
  'products.max': { label: 'عدد المنتجات', kind: 'limit' },
  'employees.max': { label: 'عدد الموظفين', kind: 'limit' },
  'storage.mb': { label: 'مساحة التخزين (ميجابايت)', kind: 'limit' },
  'coupons.max_active': { label: 'أكواد خصم نشطة', kind: 'limit' },
  'promotions.max_active': { label: 'عروض نشطة', kind: 'limit' },
  'orders.monthly_max': { label: 'طلبات شهريًا', kind: 'limit' },
  'custom_domain.enabled': { label: 'دومين مخصص', kind: 'bool' },
  'analytics.advanced': { label: 'تحليلات متقدمة', kind: 'bool' },
  'import_export.enabled': { label: 'استيراد وتصدير', kind: 'bool' },
  'variants.enabled': { label: 'خيارات المنتج', kind: 'bool' },
  'whatsapp.enabled': { label: 'زر واتساب', kind: 'bool' },
};

export default async function AdminPlansPage() {
  await requirePlatformAccess('plans', 'view');
  const actor = await getActor();
  const canEdit = actor.kind === 'user' && adminHasLevel(actor, 'plans', 'edit');

  const supabase = await createClient();
  const [{ data: plans }, { data: entitlements }] = await Promise.all([
    supabase.from('plans')
      .select('id, code, name, price, duration_days, is_free, price_configured_at')
      .order('sort_order'),
    supabase.from('plan_entitlements')
      .select('plan_id, feature_key, limit_value, bool_value, configured_at'),
  ]);

  const byPlan = new Map<string, EntitlementRow[]>();
  for (const e of entitlements ?? []) {
    const meta = FEATURES[e.feature_key] ?? { label: e.feature_key, kind: 'limit' as const };
    const list = byPlan.get(e.plan_id) ?? [];
    list.push({
      featureKey: e.feature_key,
      label: meta.label,
      kind: meta.kind,
      limitValue: e.limit_value,
      boolValue: e.bool_value,
      configured: e.configured_at !== null,
    });
    byPlan.set(e.plan_id, list);
  }

  const rows: PlanRow[] = (plans ?? []).map((p) => ({
    id: p.id, code: p.code, name: p.name,
    price: Number(p.price), durationDays: p.duration_days, isFree: p.is_free,
    priceConfigured: p.price_configured_at !== null,
    entitlements: (byPlan.get(p.id) ?? [])
      .sort((a, b) => a.label.localeCompare(b.label, 'ar')),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الباقات والحدود</h1>
        <p className="text-sm text-ink-500">
          لا يفترض النظام سعرًا ولا حدًّا لم تضبطه هنا (D18)، والإطلاق التجاري
          لا يُفعَّل حتى تكتمل القيم (D31).
        </p>
      </div>

      <PlanEditor plans={rows} canEdit={canEdit} />
    </div>
  );
}
