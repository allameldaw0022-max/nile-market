import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { ProductForm } from '@/components/dashboard/ProductForm';
import { loadCategories, loadProductForm } from '@/lib/products/queries';

export const metadata: Metadata = { title: 'تعديل منتج' };

export default async function EditProductPage({ params }: PageProps<'/dashboard/products/[id]/edit'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'products:update');
  const { id } = await params;

  const [product, categories] = await Promise.all([
    loadProductForm(membership.storeId, id),
    loadCategories(membership.storeId),
  ]);
  // منتج متجر آخر يُعاد كـ404 لا 403: لا نؤكد وجوده لمن لا يملكه
  if (!product) notFound();

  return (
    <div className="space-y-5">
      <Link href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> المنتجات
      </Link>
      <h1 className="truncate text-xl font-extrabold text-navy-900">{product.name}</h1>

      <ProductForm storeId={membership.storeId} initial={product}
                   categories={categories}
                   canDelete={can(membership, 'products:delete')} />
    </div>
  );
}
