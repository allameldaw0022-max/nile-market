import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';
import { rpc, type SeriesPoint } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'التقارير — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90, 365];

/**
 * تقارير المنصة.
 *
 * ★ كل رقم هنا يُحسب في القاعدة باستعلام واحد (`platform_reports`):
 * جمع المبالغ في الواجهة يفتح باب اختلاف الأرقام بين شاشتين (D10).
 */
export default async function AdminReportsPage(
  { searchParams }: PageProps<'/admin/reports'>,
) {
  await requirePlatformAccess('reports', 'view');

  const sp = await searchParams;
  const requested = Number(sp.days ?? 30);
  const days = RANGES.includes(requested) ? requested : 30;

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'platform_reports', { p_days: days });
  if (error || !data) return <ErrorState description="تعذّر تحميل التقارير" />;

  const r = data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">التقارير</h1>
        <p className="text-sm text-ink-500">
          منذ {formatDate(r.from)} — {days} يومًا.
        </p>
      </div>

      <nav className="flex gap-1.5" aria-label="المدة">
        {RANGES.map((d) => (
          <Link key={d} href={`/admin/reports?days=${d}`}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold
                            ${d === days
                              ? 'border-teal-600 bg-teal-600 text-white'
                              : 'border-ink-300 bg-white text-ink-600 hover:border-teal-400'}`}>
            {d} يومًا
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إيراد الاشتراكات" value={formatMoney(r.totals.revenue)}
                  tone="gold" />
        <StatCard label="متاجر جديدة" value={formatNumber(r.totals.stores)} />
        <StatCard label="طلبات المتاجر" value={formatNumber(r.totals.orders)} />
        <StatCard label="قيمة المبيعات (GMV)" value={formatMoney(r.totals.gmv)}
                  hint="مجموع الطلبات غير الملغاة" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="عمولات مستحقّة الآن" value={formatMoney(r.commissions.payable)} />
        <StatCard label="عمولات قُيِّدت في المدة"
                  value={formatMoney(r.commissions.accrued)} />
        <StatCard label="صُرف للشركاء في المدة"
                  value={formatMoney(r.commissions.paid_period)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Series title="الإيراد اليومي" points={r.revenue_series} money />
        <Series title="المتاجر الجديدة" points={r.stores_series} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="الاشتراكات المعتمدة حسب الباقة" />
        {r.by_plan.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">لا اشتراكات معتمدة في المدة.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {r.by_plan.map((p) => (
              <li key={p.plan} className="flex items-center gap-4 px-5 py-3">
                <span className="flex-1 font-bold text-ink-900">{p.plan}</span>
                <span className="text-sm tabular text-ink-600">
                  {formatNumber(p.count)} اشتراك
                </span>
                <span className="font-bold tabular text-ink-900">
                  {formatMoney(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="أنشط المتاجر" description="بحسب قيمة الطلبات في المدة." />
        {r.top_stores.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">لا طلبات في المدة.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {r.top_stores.map((s) => (
              <li key={s.store} className="flex items-center gap-4 px-5 py-3">
                <span className="flex-1 truncate font-bold text-ink-900">{s.store}</span>
                <span className="text-sm tabular text-ink-600">
                  {formatNumber(s.orders)} طلب
                </span>
                <span className="font-bold tabular text-ink-900">
                  {formatMoney(s.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * سلسلة يومية كأعمدة نسبية.
 *
 * ★ القيمة مكتوبة نصًّا في كل عمود إلى جانب ارتفاعه: الشكل وحده لا
 * يكفي لقارئ الشاشة ولا لمن يقارن رقمين متقاربين (§17.1).
 */
function Series({ title, points, money = false }: {
  title: string; points: SeriesPoint[]; money?: boolean;
}) {
  const values = points.map((p) => Number(p.amount ?? p.count ?? 0));
  const max = Math.max(1, ...values);

  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} />
      {points.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-500">لا بيانات في المدة.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto p-4">
          {points.map((p, i) => {
            const value = values[i];
            return (
              <li key={p.date} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-ink-500">{formatDate(p.date)}</span>
                <span className="h-2.5 flex-1 rounded-full bg-ink-100">
                  <span className="block h-2.5 rounded-full bg-teal-600"
                        style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
                </span>
                <span className="w-24 shrink-0 text-end font-bold tabular text-ink-900">
                  {money ? formatMoney(value) : formatNumber(value)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
