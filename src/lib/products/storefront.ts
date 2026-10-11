import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';
import type { StorefrontProduct } from '@/components/storefront/ProductCard';
import { searchTerm, ilikeAny } from '@/lib/search';

export const STOREFRONT_SELECT =
  'id, name, slug, price, compare_at_price, rating_avg, rating_count, ' +
  // ★ `track_inventory` و`in_stock` تُقرآن لتعرف البطاقة أن تقول «نفد»:
  //   بدونهما كانت تَعِد بالشراء لكلّ منتج، نافدًا كان أو لا.
  'has_variants, track_inventory, in_stock, ' +
  'product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))';

export type Sort = 'newest' | 'price_asc' | 'price_desc' | 'name';

/**
 * قائمة منتجات المتجر للزائر.
 * `status = 'active'` و`deleted_at is null` شرطان صريحان هنا فوق ما
 * تفرضه RLS: المسودّات لا تظهر للزبون ولو تغيّرت سياسة يومًا ما.
 *
 * ★★ عميل بلا كوكيز: النتيجة **عامّة** — نفس القائمة لكل زائر —
 * وكان استعمال عميل الجلسة هنا يجعل كل صفحة قائمة (كل المنتجات،
 * التصنيف، البحث، الرئيسية) تلمس `cookies()` فتُصيَّر لكل طلب.
 * وRLS سارية كما هي: مفتاح `anon` ودور `anon`، وما يراه هذا العميل
 * هو بالضبط ما يحقّ لأي زائر أن يراه.
 */
async function queryProducts(input: {
  storeId: string;
  categoryId?: string | null;
  term?: string | null;
  sort?: Sort;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  from: number;
  size: number;
}): Promise<{ products: StorefrontProduct[]; total: number }> {
  const supabase = createPublicClient();
  let query = supabase
    .from('products')
    .select(STOREFRONT_SELECT, { count: 'exact' })
    .eq('store_id', input.storeId)
    .eq('status', 'active')
    .is('deleted_at', null);

  if (input.categoryId) query = query.eq('category_id', input.categoryId);

  // ★ نطاق السعر شرطٌ في القاعدة لا ترشيحٌ بعد الجلب: الترشيح بعد
  //   الجلب يكسر العدّ والترقيم معًا — صفحةٌ تقول «٢٤ نتيجة» وتعرض
  //   ستًّا. والحدّان مُتحقَّق منهما قبل الوصول إلى هنا.
  if (input.minPrice != null) query = query.gte('price', input.minPrice);
  if (input.maxPrice != null) query = query.lte('price', input.maxPrice);

  // ★★ عمودٌ مصون في القاعدة (0064) لا تقريبٌ على `quantity`:
  //    `quantity > 0` كان يَعِد بتوفّر ما كلّ كمّيته محجوزة، ويُخفي
  //    المنتج الذي لا يُتتبَّع مخزونه. والعمود يقول الحقيقة ويُفهرَس.
  if (input.inStock) query = query.eq('in_stock', true);

  // التنظيف وحدّ الطول في `@/lib/search` — لا نسخة محلية تنحرف
  const search = ilikeAny(searchTerm(input.term), ['name', 'description']);
  if (search) query = query.or(search);

  query = input.sort === 'price_asc' ? query.order('price')
    : input.sort === 'price_desc' ? query.order('price', { ascending: false })
    : input.sort === 'name' ? query.order('name')
    : query.order('created_at', { ascending: false });

  const { data, count } = await query.range(input.from, input.from + input.size - 1);
  return {
    products: (data ?? []) as unknown as StorefrontProduct[],
    // ★ `count` يُشتقّ من ترويسة `content-range` فيُحلَّل نصًّا: ترويسة
    //   غير متوقّعة تُعطي NaN لا null، و`?? 0` لا تصطادها. وNaN هنا
    //   يسري إلى «NaN منتج» على الصفحة وإلى حساب عدد الصفحات.
    total: Number.isFinite(count) ? (count as number) : 0,
  };
}

/**
 * ★ نفس القائمة لا تُستعلَم مرّتين بين الطلبات: تُخزَّن بوسم
 * `store:<id>:products` — وهو الوسم الذي تُطلقه أفعال المنتجات
 * القائمة، فتعديل التاجر يظهر فورًا لا بعد دقيقة.
 *
 * ★ والمفتاح يحمل كل ما يغيّر النتيجة (المتجر، التصنيف، الكلمة،
 * الترتيب، الصفحة) — وإلا خُدمت صفحةٌ بنتائج أخرى.
 */
export async function listStorefrontProducts(input: {
  storeId: string;
  categoryId?: string | null;
  term?: string | null;
  sort?: Sort;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  from: number;
  size: number;
}): Promise<{ products: StorefrontProduct[]; total: number }> {
  // ★★ المفتاح يحمل كل ما يغيّر النتيجة — والحدّان منه. إغفالهما كان
  //    سيخدم نتائج نطاقٍ لطالب نطاقٍ آخر من نفس المدخل المخزَّن.
  const key = [
    'sf-products', input.storeId, input.categoryId ?? '-',
    searchTerm(input.term) || '-', input.sort ?? 'newest',
    input.minPrice == null ? '-' : String(input.minPrice),
    input.maxPrice == null ? '-' : String(input.maxPrice),
    input.inStock ? 'in' : '-',
    String(input.from), String(input.size),
  ];
  const load = unstable_cache(() => queryProducts(input), key, {
    revalidate: 60,
    tags: [storeTag(input.storeId, 'products')],
  });
  return load();
}
