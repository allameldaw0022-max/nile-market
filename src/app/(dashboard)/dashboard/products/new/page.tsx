import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { ProductForm } from '@/components/dashboard/ProductForm';
import { EMPTY_PRODUCT, loadCategories } from '@/lib/products/queries';

export const metadata: Metadata = { title: 'منتج جديد' };

export default async function NewProductPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  // الحارس الخادمي — لا اعتماد على إخفاء الزر في الواجهة
  const { membership } = await requireStoreAccess(first.storeId, 'products:create');
  const categories = await loadCategories(membership.storeId);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> المنتجات
      </Link>
      <h1 className="text-xl font-extrabold text-ink-900">منتج جديد</h1>

      <ProductForm storeId={membership.storeId} initial={EMPTY_PRODUCT}
                   categories={categories} canDelete={false} />
    </div>
  );
}
