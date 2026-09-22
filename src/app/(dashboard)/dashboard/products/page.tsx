import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Download, Package, Plus, Upload } from 'lucide-react';
import { requireStoreAccess, can } from '@/lib/authz/guards';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { ProductFilters } from '@/components/dashboard/ProductFilters';
import { ProductRowActions } from '@/components/dashboard/ProductRowActions';
import { PRODUCT_STATUS } from '@/lib/status';
import { formatMoney } from '@/lib/money/format';
import { loadCategories } from '@/lib/products/queries';
import { mediaUrl } from '@/lib/media/url';

export const metadata: Metadata = { title: 'المنتجات' };

const PAGE_SIZE = 20;

type Row = {
  id: string; name: string; slug: string; price: number; status: string;
  sku: string | null;
  inventory: { quantity: number; low_stock_threshold: number | null }[] | null;
  product_images: {
    sort_order: number; media_files: { bucket: string; path: string } | null;
  }[] | null;
};

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
  const term = typeof sp.q === 'string' ? sp.q.trim() : '';
  const status = typeof sp.status === 'string' ? sp.status : '';
  const category = typeof sp.category === 'string' ? sp.category : '';
  const sort = typeof sp.sort === 'string' ? sp.sort : 'newest';

  const supabase = await createClient();

  // Pagination إلزامي — لا استعلام مفتوح (§18.3)
  let query = supabase
    .from('products')
    .select(
      'id, name, slug, price, status, sku, ' +
      'inventory(quantity, low_stock_threshold), ' +
      'product_images(sort_order, media_files(bucket, path))',
      { count: 'exact' },
    )
    .eq('store_id', membership.storeId)
    .is('deleted_at', null);

  if (term) {
    // `or` يُبنى نصًّا في PostgREST، فأي حرف له معنى في صيغته يُنظَّف
    // من نص المستخدم قبل الإدراج: أقواس · فواصل · اقتباس · نجمة.
    const safe = term.replace(/["'(),*\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (safe) query = query.or(`name.ilike."%${safe}%",sku.ilike."%${safe}%"`);
  }
  // القيمة تُطابَق على قائمة معروفة قبل استخدامها في الاستعلام
  if (isProductStatus(status)) query = query.eq('status', status);
  if (category) query = query.eq('category_id', category);

  query = sort === 'name' ? query.order('name')
    : sort === 'price_asc' ? query.order('price')
    : sort === 'price_desc' ? query.order('price', { ascending: false })
    : query.order('created_at', { ascending: false });

  const [{ data, count }, categories] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
    loadCategories(membership.storeId),
  ]);

  const products = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // الترتيب بالمخزون لا يمكن في PostgREST على جدول مرتبط ⇒ يُرتَّب
  // داخل الصفحة الحالية، والتصفية الحقيقية بالحالة والتصنيف في القاعدة.
  const list = sort === 'stock_asc'
    ? [...products].sort((a, b) => quantityOf(a) - quantityOf(b))
    : products;

  const filtered = Boolean(term || status || category);
  const canCreate = can(membership, 'products:create');

  const qs = (next: number) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    if (category) params.set('category', category);
    if (sort !== 'newest') params.set('sort', sort);
    params.set('page', String(next));
    return `/dashboard/products?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">المنتجات</h1>
          <p className="text-sm text-sand-600 tabular">{total} منتج</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(membership, 'export:data') && (
            <a href="/dashboard/products/export" download>
              <Button variant="outline" size="sm" icon={<Download size={15} />}>تصدير</Button>
            </a>
          )}
          {canCreate && (
            <Link href="/dashboard/products/import">
              <Button variant="outline" size="sm" icon={<Upload size={15} />}>استيراد</Button>
            </Link>
          )}
          {canCreate && (
            <Link href="/dashboard/products/new">
              <Button icon={<Plus size={16} />}>منتج جديد</Button>
            </Link>
          )}
        </div>
      </div>

      {(total > 0 || filtered) && <ProductFilters categories={categories} />}

      {list.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Package size={36} strokeWidth={1.5} />}
            title="لا نتائج مطابقة"
            description="جرّب كلمة بحث أخرى أو أزِل التصفية."
            action={<Link href="/dashboard/products">
              <Button variant="outline" size="sm">إظهار كل المنتجات</Button>
            </Link>}
          />
        ) : (
          <EmptyState
            icon={<Package size={36} strokeWidth={1.5} />}
            title="لا توجد منتجات بعد"
            description="أضف أول منتج ليظهر في متجرك مباشرة."
            action={canCreate ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href="/dashboard/products/new">
                  <Button icon={<Plus size={16} />}>إضافة منتج</Button>
                </Link>
                <Link href="/dashboard/products/import">
                  <Button variant="outline" icon={<Upload size={15} />}>
                    استيراد من ملف
                  </Button>
                </Link>
              </div>
            ) : undefined}
          />
        )
      ) : (
        <Card className="overflow-hidden">
          {/* صف واحد يتكيّف: جدول على الشاشات الكبيرة، بطاقة على الهاتف (§17.5) */}
          <ul className="divide-y divide-sand-200">
            {list.map((p) => {
              const qty = quantityOf(p);
              const threshold = p.inventory?.[0]?.low_stock_threshold ?? 5;
              const cover = [...(p.product_images ?? [])]
                .sort((a, b) => a.sort_order - b.sort_order)[0]?.media_files ?? null;
              const coverUrl = mediaUrl(cover);

              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-3 hover:bg-sand-50">
                  <Link href={`/dashboard/products/${p.id}/edit`}
                        className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative size-11 shrink-0 overflow-hidden
                                    rounded-[--radius-md] border border-sand-200 bg-sand-50">
                      {coverUrl ? (
                        <Image src={coverUrl} alt="" fill sizes="44px" className="object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-sand-400">
                          <Package size={16} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-navy-900">{p.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-sand-600">
                        <span className="font-bold text-navy-700 tabular">
                          {formatMoney(p.price)}
                        </span>
                        {p.sku && <span className="tabular" dir="ltr">{p.sku}</span>}
                        <span className={qty <= threshold
                          ? 'font-bold text-[--color-danger]' : ''}>
                          المخزون: <span className="tabular">{qty}</span>
                        </span>
                      </p>
                    </div>
                  </Link>

                  <StatusChip map={PRODUCT_STATUS} value={p.status} />

                  {can(membership, 'products:update') && (
                    <ProductRowActions
                      storeId={membership.storeId} productId={p.id} status={p.status}
                      canDelete={can(membership, 'products:delete')} />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={qs(page - 1)}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-sand-600 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={qs(page + 1)}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

const STATUSES = ['draft', 'active', 'hidden', 'archived'] as const;
type ProductStatusValue = (typeof STATUSES)[number];

function isProductStatus(value: string): value is ProductStatusValue {
  return (STATUSES as readonly string[]).includes(value);
}

function quantityOf(p: Row): number {
  return (p.inventory ?? []).reduce((sum, i) => sum + i.quantity, 0);
}
