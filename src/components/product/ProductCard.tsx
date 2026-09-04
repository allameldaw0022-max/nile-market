import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";

export function ProductCard({
  product,
}: {
  product: { id: string; name: string; price: number; currency: string; images: unknown; stock: number };
}) {
  const firstImage = Array.isArray(product.images) ? (product.images[0] as string | undefined) : undefined;

  return (
    <Link
      href={`/product/${product.id}`}
      className="bg-white rounded-2xl border border-black/5 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square bg-neutral-50 flex items-center justify-center">
        {firstImage ? (
          <Image src={firstImage} alt={product.name} width={300} height={300} className="object-cover w-full h-full" />
        ) : (
          <Package className="text-neutral-300" size={32} />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-navy truncate">{product.name}</p>
        <p className="text-primary font-extrabold text-sm mt-1">
          {product.price.toLocaleString("ar")} {product.currency}
        </p>
        {product.stock === 0 && <p className="text-[11px] text-red-500 font-bold mt-1">نفدت الكمية</p>}
      </div>
    </Link>
  );
}
