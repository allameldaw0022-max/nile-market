import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { ORDER_STATUS } from '@/lib/status';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = { title: 'الإحصائيات' };

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];

/**
 * إحصاءات المتجر.
 *
 * ★ الأرقام كلها من `store_analytics()` في استعلام واحد: جمعها في
 * الواجهة كان سيجعل «الإيراد» هنا يخالف «الإيراد» في صفحة الطلبات.
 *
 * ★ ما لا نعرفه يُقال صراحةً: معدّل تحويل بلا زوّار يُعرض «—» لا صفرًا.
 */
export default async function AnalyticsPage(
  { searchParams }: PageProps<'/dashboard/analytics'>,
) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'analytics:view');

  const sp = await searchParams;
  const requested = Number(sp.days ?? 30);
  const days = RANGES.includes(requested) ? requested : 30;

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'store_analytics', {
    p_store_id: membership.storeId, p_days: days,
  });
  if (error || !data) return <ErrorState description="تعذّر تحميل الإحصائيات" />;

  const a = data;
  const maxVisits = Math.max(1, ...a.series.map((d) => Number(d.visits)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الإحصائيات</h1>
        <p className="text-sm text-ink-500">
          منذ {formatDate(a.from)} — يشمل اليوم الجاري.
        </p>
      </div>

      <nav className="flex gap-1.5" aria-label="المدة">
        {RANGES.map((d) => (
          <Link key={d} href={`/dashboard/analytics?days=${d}`}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold
                            ${d === days
                              ? 'border-teal-600 bg-teal-600 text-white'
                              : 'border-ink-300 bg-white text-ink-600 hover:border-teal-400'}`}>
            {d} يومًا
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الزوّار" value={formatNumber(a.totals.visitors)}
                  hint={`${formatNumber(a.totals.visits)} زيارة`} />
        <StatCard label="الطلبات" value={formatNumber(a.totals.orders)} />
        <StatCard label="المبيعات" value={formatMoney(a.totals.revenue)} tone="gold" />
        <StatCard
          label="معدّل التحويل"
          value={a.totals.conversion === null ? '—' : `${a.totals.conversion}%`}
          hint={a.totals.conversion === null
            ? 'لا زوّار في المدة — لا يُحسب'
            : 'طلب لكل زائر مميّز'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="متوسط قيمة الطلب"
                  value={a.totals.aov === null ? '—' : formatMoney(a.totals.aov)} />
        <StatCard label="عملاء جدد" value={formatNumber(a.totals.new_customers)} />
        <StatCard label="قطع مُباعة" value={formatNumber(a.totals.items_sold)} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="الزيارات والطلبات يوميًا" />
        {a.series.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">لا بيانات بعد.</p>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto p-4">
            {a.series.map((d) => (
              <li key={d.date} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-ink-500">{formatDate(d.date)}</span>
                <span className="h-2.5 flex-1 rounded-full bg-ink-100">
                  <span className="block h-2.5 rounded-full bg-teal-600"
                        style={{ width: `${Math.max(2, (Number(d.visits) / maxVisits) * 100)}%` }} />
                </span>
                <span className="w-16 shrink-0 text-end tabular text-ink-600">
                  {formatNumber(d.visits)} زيارة
                </span>
                <span className="w-16 shrink-0 text-end font-bold tabular text-ink-900">
                  {formatNumber(d.orders)} طلب
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="أكثر المنتجات مبيعًا" />
          {a.top_products.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">لا مبيعات في المدة.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {a.top_products.map((p) => (
                <li key={p.name} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">
                    {p.name}
                  </span>
                  <span className="text-xs tabular text-ink-500">
                    {formatNumber(p.quantity)} قطعة
                  </span>
                  <span className="font-bold tabular text-ink-900">
                    {formatMoney(p.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="أكثر الصفحات زيارة" />
          {a.top_pages.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">لا زيارات مسجّلة بعد.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {a.top_pages.map((p) => (
                <li key={p.path} className="flex items-center gap-3 px-5 py-3">
                  <span dir="ltr"
                        className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-900">
                    {p.path}
                  </span>
                  <span className="font-bold tabular text-ink-900">
                    {formatNumber(p.visits)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="الطلبات حسب الحالة" />
        {Object.keys(a.by_status).length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">لا طلبات في المدة.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {Object.entries(a.by_status).map(([status, count]) => (
              <li key={status} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 text-sm font-bold text-ink-900">
                  {ORDER_STATUS[status]?.label ?? status}
                </span>
                <span className="font-bold tabular text-ink-900">
                  {formatNumber(count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
