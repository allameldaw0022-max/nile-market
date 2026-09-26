import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { resolveStoreByHost, storeTag } from '@/lib/tenant/resolve';
import { createPublicClient } from '@/lib/supabase/public';
import { listStorefrontProducts, type Sort } from '@/lib/products/storefront';
import { searchTerm } from '@/lib/search';

/**
 * ★★ نتائج تصفّح المنتجات — قائمة عامّة بلا تخطيط.
 *
 * قياس المرحلة السابقة: كلفة أيّ صفحة متجر ديناميكية ٨٨٪ منها
 * **التخطيط** (٢٤–٢٧ م.ث) لا جسم الصفحة (٣–٨ م.ث). ومعالج مسار لا
 * يصيّر تخطيطًا: قِيس ٥ م.ث. فترقيمُ الصفحات وترتيبها والبحث — وهي
 * وحدها ما يمنع تخزين `/products` و`/categories` و`/search` — تنتقل
 * إلى هنا، وتبقى الصفحة الافتراضية مصيَّرة خادميًّا ومخزَّنة ومفهرسة.
 *
 * ★ لا يُقرأ كوكيٌّ واحد هنا، ولا تُلمس جلسة. الجواب دالّةٌ في
 *   (المضيف + معاملات الاستعلام) وحدها — ولذلك **يُخزَّن علنًا**
 *   (`s-maxage`)، فتصير صفحة ٢ والترتيب والبحث قابلة للتخزين على
 *   الـCDN أيضًا. ولو قُرئ كوكيٌّ هنا لصار التخزين العلني تسريبًا.
 *
 * ★ المتجر من **المضيف** في المسار حصريًّا — لا `store_id` من العميل.
 *   وهو جدار IDOR نفسه الذي يحمي بقية المتجر.
 * ★ والتصنيف يُرسله العميل **سَلَكًا** لا معرّفًا، ويُترجَم هنا داخل
 *   هذا المتجر وحده — فسَلَك تصنيفٍ في متجر آخر لا يُترجَم.
 * ★ وRLS سارية كما هي: نفس `listStorefrontProducts` بعميل `anon`.
 *
 * ★ وحدودٌ صريحة حتى لا يصير المسار وسيلة استنزاف: الصفحة ١..١٠٠،
 *   والحجم ثابت في الخادم لا يرسله العميل، والترتيب من قائمة سماح،
 *   والكلمة تمرّ بـ`searchTerm` (تنقية وحدّ طول). والنتيجة مخزَّنة
 *   بوسم منتجات المتجر، فالطلب المتكرّر لا يلمس القاعدة.
 */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;
const MAX_PAGE = 100;
const SORTS: Sort[] = ['newest', 'price_asc', 'price_desc', 'name'];

/** سَلَك التصنيف ⟶ معرّفه، محصورًا بهذا المتجر ومخزَّنًا. */
const categoryIdOf = (storeId: string, slug: string) => unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.from('categories').select('id')
      .eq('store_id', storeId).eq('slug', slug)
      .eq('is_active', true).is('deleted_at', null).maybeSingle();
    return data?.id ?? null;
  },
  ['api-category-id', storeId, slug],
  { revalidate: 300, tags: [storeTag(storeId, 'settings')] },
);

export async function GET(
  request: Request,
  { params }: RouteContext<'/sites/[host]/api/products'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  // متجر غير منشور لا يُسلّم قائمته — نفس ما يفعله التخطيط
  if (!store || store.status !== 'active') {
    return NextResponse.json({ products: [], total: 0, page: 1, pages: 1 },
                             { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  const sp = new URL(request.url).searchParams;
  const page = Math.min(MAX_PAGE, Math.max(1, Number(sp.get('page') ?? 1) || 1));
  const sortRaw = sp.get('sort') ?? 'newest';
  const sort = (SORTS as string[]).includes(sortRaw) ? (sortRaw as Sort) : 'newest';
  const term = searchTerm(sp.get('q'));
  const categorySlug = sp.get('category');

  const categoryId = categorySlug
    ? await categoryIdOf(store.storeId, categorySlug)()
    : null;
  // سَلَك تصنيف لا يُترجَم ⇒ لا نتائج، لا تجاهلُ الشرط (وإلا سُلّمت
  // قائمة المتجر كاملة لمن طلب تصنيفًا غير موجود)
  if (categorySlug && !categoryId) {
    return NextResponse.json({ products: [], total: 0, page, pages: 1 },
                             { headers: { 'cache-control': 'no-store' } });
  }

  const { products, total } = await listStorefrontProducts({
    storeId: store.storeId,
    categoryId,
    term: term.length >= 2 ? term : null,
    sort,
    from: (page - 1) * PAGE_SIZE,
    size: PAGE_SIZE,
  });

  return NextResponse.json(
    { products, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    {
      headers: {
        // ★ علنيّ عن قصد: لا كوكي ولا جلسة في هذا الجواب.
        'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
