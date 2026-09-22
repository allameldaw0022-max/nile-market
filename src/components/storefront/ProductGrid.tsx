import { Package } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { ProductCard, type StorefrontProduct } from './ProductCard';

export function ProductGrid({ products, emptyTitle, emptyDescription }: {
  products: StorefrontProduct[];
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (products.length === 0) {
    return (
      <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                  title={emptyTitle} description={emptyDescription} />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i === 0} />)}
    </div>
  );
}
