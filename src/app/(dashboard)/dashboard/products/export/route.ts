import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/supabase/rpc';
import { toCsv } from '@/lib/import/csv';
import { PRODUCT_STATUS } from '@/lib/status';

/**
 * تصدير المنتجات CSV.
 *
 * الترويسات عربية ومتوافقة مع ما يقبله الاستيراد ⇒ ملف مُصدَّر يمكن
 * تعديله وإعادة استيراده دون إعادة تسمية أعمدة.
 *
 * الأعمدة كلها من بيانات المتجر نفسه؛ سعر التكلفة يخرج هنا لأن
 * الوجهة هي التاجر لا واجهة المتجر، ولا يُصدَّر إلا لمن يملك
 * `export:data`.
 */
export async function GET() {
  const actor = await getActor();
  if (actor.kind !== 'user') {
    return new Response('يجب تسجيل الدخول', { status: 401 });
  }
  const first = actor.stores[0];
  if (!first) return new Response('لا يوجد متجر', { status: 404 });

  try {
    const { membership } = await requireStoreAccess(first.storeId, 'export:data');
    const supabase = await createClient();

    const rows: (string | number | null)[][] = [[
      'اسم المنتج', 'السعر', 'السعر قبل الخصم', 'سعر التكلفة',
      'رمز المنتج', 'الكمية', 'التصنيف', 'الوصف', 'الرابط', 'الحالة',
    ]];

    // ★ التكاليف من دالة مُحكمة: العمود محجوب عن المسار العام (0038).
    // تُقرأ مرّة واحدة لا لكل صفحة — لا N+1.
    const { data: costRows } = await rpc(supabase, 'product_costs', {
      p_store_id: membership.storeId,
    });
    const costs = new Map(
      (costRows ?? []).map((c) => [c.product_id, c.cost_price]));

    // ترحيل بصفحات: تصدير متجر كبير في استعلام واحد يستهلك الذاكرة
    const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, price, compare_at_price, sku, slug, status, description, ' +
          'categories(name), inventory(quantity)',
        )
        .eq('store_id', membership.storeId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);

      if (error) return new Response('تعذّر التصدير', { status: 500 });
      if (!data || data.length === 0) break;

      for (const raw of data) {
        const p = raw as unknown as {
          id: string;
          name: string; price: number; compare_at_price: number | null;
          sku: string | null; slug: string;
          status: string; description: string | null;
          categories: { name: string } | null;
          inventory: { quantity: number }[] | null;
        };
        rows.push([
          p.name, p.price, p.compare_at_price, costs.get(p.id) ?? null, p.sku,
          (p.inventory ?? []).reduce((s, i) => s + i.quantity, 0),
          p.categories?.name ?? '', p.description ?? '', p.slug,
          PRODUCT_STATUS[p.status]?.label ?? p.status,
        ]);
      }
      if (data.length < PAGE) break;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(toCsv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="products-${stamp}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new Response('ليس لديك صلاحية التصدير', { status: 403 });
  }
}
