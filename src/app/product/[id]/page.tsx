import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { getProduct } from "@/lib/queries/catalog";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { MarketerShareBar } from "@/components/product/MarketerShareBar";
import { ReferralCapture } from "@/components/product/ReferralCapture";
import { createClient } from "@/lib/supabase/server";

export default async function ProductPage({ params }: PageProps<"/product/[id]">) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product || product.status !== "active") notFound();

  // Fire-and-forget: internal stat only, never shown to the customer (see below).
  const supabase = await createClient();
  void supabase.rpc("increment_product_views", { p_product_id: id });

  const firstImage = Array.isArray(product.images) ? (product.images[0] as string | undefined) : undefined;
  const store = product.stores as { name: string; slug: string } | null;

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full p-4">
      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
        <div className="aspect-square bg-neutral-50 flex items-center justify-center">
          {firstImage ? (
            <Image src={firstImage} alt={product.name} width={600} height={600} className="object-cover w-full h-full" />
          ) : (
            <Package className="text-neutral-300" size={48} />
          )}
        </div>
        <div className="p-5">
          {store && (
            <Link href={`/store/${store.slug}`} className="text-xs text-primary font-bold">
              {store.name}
            </Link>
          )}
          <h1 className="font-extrabold text-xl text-navy mt-1">{product.name}</h1>
          <p className="text-primary font-extrabold text-lg mt-2">
            {product.price.toLocaleString("ar")} {product.currency}
          </p>
          {product.description && (
            <p className="text-sm text-neutral-500 mt-3 leading-relaxed">{product.description}</p>
          )}
          <div className="mt-5">
            <AddToCartButton productId={product.id} outOfStock={product.stock === 0} />
          </div>
          <MarketerShareBar productId={product.id} productName={product.name} />
        </div>
      </div>
      <Suspense fallback={null}>
        <ReferralCapture productId={product.id} />
      </Suspense>
    </main>
  );
}
