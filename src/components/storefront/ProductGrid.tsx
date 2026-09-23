import { Package } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { ProductCard, type StorefrontProduct } from './ProductCard';
import { wishlistStateFor } from '@/lib/wishlist/actions';
import { getActor } from '@/lib/auth/actor';

/**
 * ★ حالة المفضّلة تُجلب هنا مرّة واحدة لكل الشبكة، لا استعلامًا لكل
 * بطاقة. والزائر يحصل على مجموعة فارغة بلا خطأ فتُعرض له الشبكة
 * كاملة بقلوب فارغة.
 */
export async function ProductGrid({ products, host, emptyTitle, emptyDescription }: {
  products: StorefrontProduct[];
  host: string;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (products.length === 0) {
    return (
      <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                  title={emptyTitle} description={emptyDescription} />
    );
  }

  const [actor, saved] = await Promise.all([
    getActor(),
    wishlistStateFor(products.map((p) => p.id)),
  ]);
  const signedIn = actor.kind === 'user';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} host={host} priority={i < 2}
                     saved={saved.has(p.id)} signedIn={signedIn} />
      ))}
    </div>
  );
}
