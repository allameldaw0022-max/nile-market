import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/supabase/rpc';
import { mediaUrl } from '@/lib/media/url';
import type { CategoryOption, ProductFormValues } from '@/components/dashboard/ProductForm';

const str = (v: number | string | null | undefined) =>
  v === null || v === undefined ? '' : String(v);

export const EMPTY_PRODUCT: ProductFormValues = {
  id: null, name: '', slug: '', description: '',
  price: '', compareAtPrice: '', costPrice: '', sku: '',
  categoryId: '', status: 'draft', trackInventory: true,
  weightGrams: '', quantity: '0', lowStockThreshold: '', images: [],
};

export async function loadCategories(storeId: string): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('categories').select('id, name')
    .eq('store_id', storeId).is('deleted_at', null)
    .order('sort_order').order('name');
  return data ?? [];
}

type ProductQueryRow = {
  id: string; name: string; slug: string; description: string | null;
  price: number; compare_at_price: number | null;
  sku: string | null; category_id: string | null; status: string;
  track_inventory: boolean; weight_grams: number | null;
  inventory: { quantity: number; low_stock_threshold: number | null }[] | null;
  product_images: {
    sort_order: number; media_file_id: string;
    media_files: { bucket: string; path: string } | null;
  }[] | null;
};

/**
 * يحمّل منتجًا لنموذج التعديل.
 * الترشيح على store_id صريح فوق RLS: دفاع بالطبقات لا بديل عنها.
 */
export async function loadProductForm(
  storeId: string, productId: string,
): Promise<ProductFormValues | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select(
      'id, name, slug, description, price, compare_at_price, sku, ' +
      'category_id, status, track_inventory, weight_grams, ' +
      'inventory(quantity, low_stock_threshold), ' +
      'product_images(sort_order, media_file_id, media_files(bucket, path))',
    )
    .eq('id', productId).eq('store_id', storeId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data) return null;
  const p = data as unknown as ProductQueryRow;
  const stock = p.inventory?.[0];

  // ★ سعر التكلفة سرّ تجاري محجوب عن المسار العام على مستوى العمود
  // (0038)، فيُقرأ من دالة تفحص `products:view` على هذا المتجر وحده.
  const { data: costs } = await rpc(supabase, 'product_costs', {
    p_store_id: storeId,
  });
  const cost = costs?.find((c) => c.product_id === productId)?.cost_price ?? null;

  const images = [...(p.product_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({ mediaId: img.media_file_id, url: mediaUrl(img.media_files) }))
    // صورة في bucket خاص لا رابط عام لها — تُستثنى بدل عرض صورة مكسورة
    .filter((img): img is { mediaId: string; url: string } => img.url !== null);

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? '',
    price: str(p.price),
    compareAtPrice: str(p.compare_at_price),
    costPrice: str(cost),
    sku: p.sku ?? '',
    categoryId: p.category_id ?? '',
    status: p.status,
    trackInventory: p.track_inventory,
    weightGrams: str(p.weight_grams),
    quantity: str(stock?.quantity ?? 0),
    lowStockThreshold: str(stock?.low_stock_threshold),
    images,
  };
}
