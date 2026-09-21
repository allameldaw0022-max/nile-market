import Link from 'next/link';
import type { Metadata } from 'next';
import { Package, Plus } from 'lucide-react';
import { requireStoreAccess } from '@/lib/authz/guards';
import { getActor } from '@/lib/auth/actor';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { PRODUCT_STATUS } from '@/lib/status';
import { formatMoney } from '@/lib/money/format';
import { can } from '@/lib/authz/guards';

export const metadata: Metadata = { title: 'المنتجات' };

const PAGE_SIZE = 20;

export default async function ProductsPage({ searchParams }: PageProps<'/dashboard/products'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  // ★ الحارس الخادمي — يرمي ويوقف التصيير إن لم تتوفر الصلاحية،
  // بصرف النظر عما تعرضه الواجهة.
  const { membership } = await requireStoreAccess(first.storeId, 'products:view');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  // Pagination إلزامي — لا استعلام مفتوح (§18.3)
  const { data: products, count } = await supabase
    .from('products')
    .select('id, name, slug, price, status, sku, inventory(quantity)', { count: 'exact' })
    .eq('store_id', membership.storeId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">المنتجات</h1>
          <p className="text-sm text-sand-600 tabular">{total} منتج</p>
        </div>
        {can(membership, 'products:create') && (
          <Link href="/dashboard/products/new">
            <Button icon={<Plus size={16} />}>منتج جديد</Button>
          </Link>
        )}
      </div>

      {!products || products.length === 0 ? (
        <EmptyState
          icon={<Package size={36} strokeWidth={1.5} />}
          title="لا توجد منتجات بعد"
          description="أضف أول منتج ليظهر في متجرك مباشرة."
          action={can(membership, 'products:create') ? (
            <Link href="/dashboard/products/new">
              <Button icon={<Plus size={16} />}>إضافة منتج</Button>
            </Link>
          ) : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          {/* جدول على الشاشات الكبيرة، بطاقات على الهاتف (§17.5) */}
          <ul className="divide-y divide-sand-200">
            {products.map((p) => {
              const qty = (p.inventory as { quantity: number }[] | null)
                ?.reduce((s, i) => s + i.quantity, 0) ?? 0;
              return (
                <li key={p.id}>
                  <Link href={`/dashboard/products/${p.id}/edit`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-sand-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-navy-900">{p.name}</p>
                      {p.sku && <p className="text-xs text-sand-600 tabular">{p.sku}</p>}
                    </div>
                    <span className="font-bold text-navy-900 tabular">{formatMoney(p.price)}</span>
                    <span className={`text-xs tabular ${qty <= 5 ? 'text-[--color-danger] font-bold' : 'text-sand-600'}`}>
                      المخزون: {qty}
                    </span>
                    <StatusChip map={PRODUCT_STATUS} value={p.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={`/dashboard/products?page=${page - 1}`}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-sand-600 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={`/dashboard/products?page=${page + 1}`}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
