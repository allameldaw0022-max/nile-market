import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const [categories, { data: settings }] = await Promise.all([
    loadCategories(membership.storeId),
    supabase.from('store_settings').select('storefront_template')
      .eq('store_id', membership.storeId).maybeSingle(),
  ]);

  // ★★ افتراضات المنتج الرقمي تختلف عن الملموس في أمرين لا ثالث لهما:
  //   · لا تتبّع مخزون — وإلا وُلد المنتج «غير متوفّر» بكمية صفر.
  //   · و«نشط» لا «مسودة»: المنتج الرقمي جاهز للبيع لحظة حفظه، ولا
  //     مخزون يُجهَّز ولا شحن يُرتَّب. والتاجر يستطيع اختيار مسودة.
  const isDigital = settings?.storefront_template === 'digital';
  const initial = isDigital
    ? { ...EMPTY_PRODUCT, status: 'active', trackInventory: false }
    : EMPTY_PRODUCT;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> المنتجات
      </Link>
      <h1 className="text-xl font-extrabold text-ink-900">منتج جديد</h1>

      <ProductForm storeId={membership.storeId} initial={initial}
                   categories={categories} canDelete={false} isDigital={isDigital} />
    </div>
  );
}
