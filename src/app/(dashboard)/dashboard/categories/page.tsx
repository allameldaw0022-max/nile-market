import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { listCategories } from '@/lib/digital/dashboard';
import { CategoryManager } from '@/components/dashboard/CategoryManager';
import { ErrorState } from '@/components/ui/States';

export const metadata: Metadata = { title: 'التصنيفات' };

export default async function CategoriesPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'products:view');
  const categories = await listCategories(membership.storeId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">التصنيفات</h1>
        <p className="text-sm text-ink-500">
          نظّم منتجاتك في تصنيفات بأسماء وصور. تعمل في القالبين.
        </p>
      </div>

      {categories.ok ? (
        <CategoryManager storeId={membership.storeId} categories={categories.data}
                         canEdit={can(membership, 'categories:manage')} />
      ) : (
        <ErrorState description={categories.message} />
      )}
    </div>
  );
}
