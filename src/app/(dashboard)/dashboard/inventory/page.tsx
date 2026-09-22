import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Boxes, History, TriangleAlert } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { InventoryAdjuster } from '@/components/dashboard/InventoryAdjuster';
import { formatDateTime, formatNumber } from '@/lib/money/format';

export const metadata: Metadata = { title: 'المخزون' };

const PAGE_SIZE = 25;

const REASON_LABEL: Record<string, string> = {
  manual_adjust:   'تعديل يدوي',
  order_placed:    'طلب جديد',
  order_cancelled: 'إلغاء طلب',
  order_returned:  'إرجاع طلب',
  import:          'استيراد',
  correction:      'تصحيح',
  initial:         'رصيد ابتدائي',
};

type StockRow = {
  quantity: number; low_stock_threshold: number | null;
  products: { id: string; name: string; sku: string | null; status: string } | null;
};

type MovementRow = {
  id: string; delta: number; reason: string; note: string | null;
  created_at: string; actor_id: string | null;
  products: { name: string } | null;
};

export default async function InventoryPage({ searchParams }: PageProps<'/dashboard/inventory'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'inventory:view');
  const canEdit = can(membership, 'inventory:update');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const lowOnly = sp.low === '1';

  const supabase = await createClient();
  const [{ data: settings }, { data: rows, count }, { data: movements }] = await Promise.all([
    supabase.from('store_settings').select('low_stock_threshold')
      .eq('store_id', membership.storeId).maybeSingle(),
    supabase.from('inventory')
      .select('quantity, low_stock_threshold, products!inner(id, name, sku, status)',
              { count: 'exact' })
      .eq('store_id', membership.storeId)
      .is('products.deleted_at', null)
      .order('quantity')
      .range(from, from + PAGE_SIZE - 1),
    supabase.from('inventory_movements')
      .select('id, delta, reason, note, created_at, actor_id, products(name)')
      .eq('store_id', membership.storeId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // أسماء المنفّذين من `store_team`: سياسات `profiles` لا تكشف صف
  // زميل، والعرض يكشف الاسم وحده لمن يملك members:view.
  const { data: team } = await supabase
    .from('store_team').select('profile_id, full_name')
    .eq('store_id', membership.storeId);
  const nameOf = new Map((team ?? [])
    .map((m) => [m.profile_id, m.full_name] as const));

  const storeThreshold = settings?.low_stock_threshold ?? 5;
  const stock = (rows ?? []) as unknown as StockRow[];
  const history = (movements ?? []) as unknown as MovementRow[];

  const isLow = (r: StockRow) => r.quantity <= (r.low_stock_threshold ?? storeThreshold);
  const list = lowOnly ? stock.filter(isLow) : stock;

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const lowCount = stock.filter(isLow).length;
  const outCount = stock.filter((r) => r.quantity === 0).length;
  const units = stock.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">المخزون</h1>
        <p className="text-sm text-ink-500">
          كل تعديل يُسجَّل كحركة باسم من نفّذه — لا تُكتب الكمية مباشرة.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="إجمالي الوحدات" value={formatNumber(units)} />
        <StatCard label="أوشك على النفاد" value={formatNumber(lowCount)}
                  hint={`الحد الافتراضي ${storeThreshold}`} tone="gold" />
        <StatCard label="نفد تمامًا" value={formatNumber(outCount)} />
      </div>

      {lowCount > 0 && !lowOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-[--radius-md]
                        border border-gold-500/40 bg-gold-300/10 p-3.5 text-sm">
          <TriangleAlert size={16} className="text-gold-700" />
          <span className="flex-1 text-ink-700">
            <span className="tabular font-bold">{lowCount}</span> منتجًا أوشك على النفاد
            في هذه الصفحة.
          </span>
          <Link href="/dashboard/inventory?low=1" className="font-bold text-teal-700
                     hover:underline">
            عرضها وحدها
          </Link>
        </div>
      )}

      {lowOnly && (
        <Link href="/dashboard/inventory">
          <Button variant="outline" size="sm">إظهار كل المنتجات</Button>
        </Link>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={<Boxes size={36} strokeWidth={1.5} />}
          title={lowOnly ? 'لا منتج أوشك على النفاد' : 'لا يوجد مخزون بعد'}
          description={lowOnly
            ? 'مخزونك في هذه الصفحة أعلى من حدود التنبيه.'
            : 'أضف منتجًا وحدّد كميته ليظهر هنا.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-200">
            {list.map((row) => {
              const product = row.products;
              if (!product) return null;
              return (
                <li key={product.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/products/${product.id}/edit`}
                          className="truncate font-bold text-ink-900 hover:text-teal-700">
                      {product.name}
                    </Link>
                    <p className="flex items-center gap-2 text-xs text-ink-500">
                      {product.sku && <span className="tabular" dir="ltr">{product.sku}</span>}
                      {row.quantity === 0 ? (
                        <Badge tone="danger">نفد</Badge>
                      ) : isLow(row) ? (
                        <Badge tone="warning">أوشك على النفاد</Badge>
                      ) : null}
                    </p>
                  </div>

                  {canEdit ? (
                    <InventoryAdjuster storeId={membership.storeId}
                                       productId={product.id} quantity={row.quantity} />
                  ) : (
                    <span className="font-bold tabular text-ink-900">{row.quantity}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && !lowOnly && (
        <nav className="flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={`/dashboard/inventory?page=${page - 1}`}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={`/dashboard/inventory?page=${page + 1}`}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}

      <Card>
        <CardHeader title="آخر الحركات"
                    description="سجل إلحاقي لا يُعدَّل ولا يُحذف." />
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">لا حركات بعد.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {history.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <History size={14} className="shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">
                  {m.products?.name ?? '—'}
                </span>
                <span className={`font-bold tabular ${m.delta > 0
                  ? 'text-[--color-success]' : 'text-[--color-danger]'}`} dir="ltr">
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
                <span className="text-xs text-ink-500">
                  {REASON_LABEL[m.reason] ?? m.reason}
                </span>
                <span className="text-xs text-ink-500">
                  {(m.actor_id ? nameOf.get(m.actor_id) : null) ?? 'النظام'}
                </span>
                <span className="text-xs text-ink-500">{formatDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
