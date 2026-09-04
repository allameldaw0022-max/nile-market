import Link from "next/link";
import Image from "next/image";
import { Store } from "lucide-react";

export function StoreCard({
  store,
}: {
  store: { name: string; slug: string; logo_url: string | null; description: string | null };
}) {
  return (
    <Link
      href={`/store/${store.slug}`}
      className="flex items-center gap-3 bg-white rounded-2xl border border-black/5 p-3 hover:shadow-md transition-shadow"
    >
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
        {store.logo_url ? (
          <Image src={store.logo_url} alt={store.name} width={48} height={48} className="object-cover w-full h-full" />
        ) : (
          <Store size={20} />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-sm text-navy truncate">{store.name}</p>
        {store.description && (
          <p className="text-xs text-neutral-400 truncate">{store.description}</p>
        )}
      </div>
    </Link>
  );
}
