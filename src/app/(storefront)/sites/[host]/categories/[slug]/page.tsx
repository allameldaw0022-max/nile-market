import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { Button } from '@/components/ui/Button';
import { listStorefrontProducts } from '@/lib/products/storefront';

export const revalidate = 60;
const PAGE_SIZE = 24;

async function loadCategory(host: string, slug: string) {
  const store = await resolveStoreByHost(host);
  if (!store) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('categories').select('id, name, slug')
    .eq('store_id', store.storeId).eq('slug', slug)
    .eq('is_active', true).is('deleted_at', null)
    .maybeSingle();
  return data ? { store, category: data } : null;
}

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/categories/[slug]'>,
): Promise<Metadata> {
  const { host, slug } = await params;
  const found = await loadCategory(host, slug);
  if (!found) return { title: 'التصنيف غير موجود' };
  return {
    title: `${found.category.name} — ${found.store.name}`,
    alternates: {
      canonical: `https://${found.store.primaryHost}/categories/${found.category.slug}`,
    },
  };
}

export default async function CategoryPage(
  { params, searchParams }: PageProps<'/sites/[host]/categories/[slug]'>,
) {
  const { host, slug } = await params;
  const found = await loadCategory(host, slug);
  if (!found) notFound();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const { products, total } = await listStorefrontProducts({
    storeId: found.store.storeId, categoryId: found.category.id,
    from: (page - 1) * PAGE_SIZE, size: PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav className="flex items-center gap-1 text-sm text-ink-500" aria-label="المسار">
        <Link href="/" className="hover:text-teal-700">الرئيسية</Link>
        <ChevronRight size={14} />
        <Link href="/products" className="hover:text-teal-700">المنتجات</Link>
      </nav>

      <h1 className="mt-4 text-xl font-extrabold text-ink-900">{found.category.name}</h1>
      <p className="text-sm text-ink-500 tabular">{total} منتج</p>

      <div className="mt-6">
        <ProductGrid products={products} host={host} emptyTitle="لا منتجات في هذا التصنيف"
                     emptyDescription="تصفّح بقية المنتجات." />
      </div>

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={`/categories/${slug}?page=${page - 1}`}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={`/categories/${slug}?page=${page + 1}`}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
