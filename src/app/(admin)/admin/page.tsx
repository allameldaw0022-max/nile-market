import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { formatMoney, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'إدارة سوق النيل',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type Overview = Record<string, number>;

export default async function AdminHomePage() {
  // ★ الحارس يفرض MFA أيضًا — لا يكفي فحص التخطيط
  await requirePlatformAccess('dashboard', 'view');

  const supabase = await createClient();
  const [{ data, error }, { data: launch }] = await Promise.all([
    rpc(supabase, 'admin_overview', {}),
    supabase.rpc('plan_configuration_status').maybeSingle(),
  ]);

  if (error) return <ErrorState description="تعذّر تحميل أرقام المنصة" />;
  const o = (data ?? {}) as Overview;

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
        `عدد حسابات الإدارة النشطة ${launch.active_admins} — فصل المهام يحتاج حسابين`);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">نظرة عامة</h1>
        <p className="text-sm text-ink-500">أرقام المنصة خلال آخر 30 يومًا.</p>
      </div>

      {blockers.length > 0 && (
        <Card className="border-gold-500/40 bg-gold-300/10 p-5">
          <h2 className="flex items-center gap-2 font-bold text-ink-900">
            <AlertTriangle size={17} className="text-gold-700" />
            الإطلاق التجاري متوقّف
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            لن يُفعَّل الإطلاق حتى تكتمل هذه القيم — ولا يفترض النظام أي قيمة
            لم تضبطها (D18 · D31).
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-ink-700">
            {blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <Link href="/admin/plans"
                className="mt-4 inline-flex items-center gap-1 text-sm font-bold
                           text-teal-700 hover:underline">
            ضبط الباقات <ArrowLeft size={14} className="flip-rtl" />
          </Link>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="متاجر نشطة" value={formatNumber(o.stores_active)}
                  hint={`${formatNumber(o.stores_total)} إجمالًا`} />
        <StatCard label="متاجر جديدة (30 يومًا)" value={formatNumber(o.stores_new_30d)} />
        <StatCard label="إيراد الاشتراكات (30 يومًا)"
                  value={formatMoney(o.revenue_30d)} tone="gold" />
        <StatCard label="طلبات المتاجر (30 يومًا)" value={formatNumber(o.orders_30d)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="اشتراكات نشطة" value={formatNumber(o.subs_active)} />
        <StatCard label="تقارب الانتهاء" value={formatNumber(o.subs_expiring)} />
        <StatCard label="منتهية" value={formatNumber(o.subs_expired)} />
        <StatCard label="شركاء نشطون" value={formatNumber(o.partners_active)} />
      </div>

      <Card>
        <CardHeader title="بانتظارك" description="عناصر تحتاج قرارًا." />
        <ul className="divide-y divide-ink-200">
          <PendingRow href="/admin/subscriptions" label="طلبات اشتراك للمراجعة"
                      count={o.requests_pending} />
          <PendingRow href="/admin/payouts" label="طلبات صرف للشركاء"
                      count={o.payouts_pending} />
          <PendingRow href="/admin/support" label="تذاكر دعم مفتوحة"
                      count={o.tickets_open} />
        </ul>
      </Card>
    </div>
  );
}

function PendingRow({ href, label, count }: {
  href: string; label: string; count: number | undefined;
}) {
  const n = count ?? 0;
  return (
    <li>
      <Link href={href}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
        <span className="flex-1 font-bold text-ink-900">{label}</span>
        <span className={`min-w-8 rounded-full px-2.5 py-0.5 text-center text-sm
                          font-extrabold tabular ${n > 0
                            ? 'bg-gold-500/20 text-gold-700'
                            : 'bg-ink-100 text-ink-500'}`}>
          {formatNumber(n)}
        </span>
        <ArrowLeft size={15} className="flip-rtl text-ink-400" />
      </Link>
    </li>
  );
}
