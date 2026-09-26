import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';
import type { StorefrontProduct } from '@/components/storefront/ProductCard';
import { searchTerm, ilikeAny } from '@/lib/search';

export const STOREFRONT_SELECT =
  'id, name, slug, price, compare_at_price, rating_avg, rating_count, ' +
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
    total: count ?? 0,
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
  from: number;
  size: number;
}): Promise<{ products: StorefrontProduct[]; total: number }> {
  const key = [
    'sf-products', input.storeId, input.categoryId ?? '-',
    searchTerm(input.term) || '-', input.sort ?? 'newest',
    String(input.from), String(input.size),
  ];
  const load = unstable_cache(() => queryProducts(input), key, {
    revalidate: 60,
    tags: [storeTag(input.storeId, 'products')],
  });
  return load();
}
