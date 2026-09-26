import type { StorefrontProduct } from '../ProductCard';
import { DigitalProductCard } from './DigitalProductCard';

/** شبكة منتجات القالب الرقمي — كثافة أعلى من العادي وبلا فراغات. */
export function DigitalGrid({ products, host, fromPrices, priorityCount = 2 }: {
  products: StorefrontProduct[];
  host: string;
  /** أدنى سعر باقة لكل منتج — يُحسب خادميًّا في استعلام واحد. */
  fromPrices?: Record<string, number>;
  priorityCount?: number;
}) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2.5 [&>*]:min-w-0
                   sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <DigitalProductCard product={p} host={host} priority={i < priorityCount}
                              fromPrice={fromPrices?.[p.id] ?? null} />
        </li>
      ))}
    </ul>
  );
}
