import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { ProductForm } from '@/components/dashboard/ProductForm';
import {
  ProductVariantsManager,
} from '@/components/dashboard/ProductVariantsManager';
import { loadCategories, loadProductForm } from '@/lib/products/queries';
import { listProductVariants } from '@/lib/products/variants';

export const metadata: Metadata = { title: 'تعديل منتج' };

export default async function EditProductPage({ params }: PageProps<'/dashboard/products/[id]/edit'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'products:update');
  const { id } = await params;

  const [product, categories, variants] = await Promise.all([
    loadProductForm(membership.storeId, id),
    loadCategories(membership.storeId),
    listProductVariants(membership.storeId, id),
  ]);
  // منتج متجر آخر يُعاد كـ404 لا 403: لا نؤكد وجوده لمن لا يملكه
  if (!product) notFound();

  return (
    <div className="space-y-5">
      <Link href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> المنتجات
      </Link>
      <h1 className="truncate text-xl font-extrabold text-ink-900">{product.name}</h1>

      <ProductForm storeId={membership.storeId} initial={product}
                   categories={categories}
                   canDelete={can(membership, 'products:delete')} />

      {/* ★ الخيارات بعد النموذج لا داخله: حفظُها نداءٌ مستقلّ لكل خيار،
          ولو كانت حقولًا في النموذج لضاع ما كُتب عند أوّل خطأ تحقّق. */}
      <ProductVariantsManager
        storeId={membership.storeId} productId={product.id ?? id}
        variants={variants.ok ? variants.data : []}
        canManage={can(membership, 'products:update')} />
    </div>
  );
}
