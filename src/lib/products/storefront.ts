import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { StorefrontProduct } from '@/components/storefront/ProductCard';

export const STOREFRONT_SELECT =
  'id, name, slug, price, compare_at_price, ' +
  'product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))';

export type Sort = 'newest' | 'price_asc' | 'price_desc' | 'name';

/**
 * قائمة منتجات المتجر للزائر.
 * `status = 'active'` و`deleted_at is null` شرطان صريحان هنا فوق ما
 * تفرضه RLS: المسودّات لا تظهر للزبون ولو تغيّرت سياسة يومًا ما.
 */
export async function listStorefrontProducts(input: {
  storeId: string;
  categoryId?: string | null;
  term?: string | null;
  sort?: Sort;
  from: number;
  size: number;
}): Promise<{ products: StorefrontProduct[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('products')
    .select(STOREFRONT_SELECT, { count: 'exact' })
    .eq('store_id', input.storeId)
    .eq('status', 'active')
    .is('deleted_at', null);

  if (input.categoryId) query = query.eq('category_id', input.categoryId);

  if (input.term) {
    // أحرف صيغة PostgREST تُنظَّف قبل بناء `or` من نص المستخدم
    const safe = input.term.replace(/["'(),*\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (safe) {
      query = query.or(`name.ilike."%${safe}%",description.ilike."%${safe}%"`);
    }
  }

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
