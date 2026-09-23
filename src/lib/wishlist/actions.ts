'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { getActor } from '@/lib/auth/actor';

/**
 * المفضّلة في واجهة المتجر.
 *
 * ★ `store_id` لا يُمرَّر من المتصفّح إطلاقًا: `toggle_wishlist` تشتقّه
 * من المنتج نفسه في القاعدة. فلا يستطيع زبون أن يربط منتج متجر
 * بمفضّلة متجر آخر، ولا يحتاج الفعل أن يفحص ذلك ثم يثق — السطح
 * ساقط أصلًا.
 *
 * ★ المفضّلة للمسجَّلين وحدهم (PERMISSIONS.md: الزائر له «سلة مجهولة
 * بكوكي» لا مفضّلة). فالزائر يُوجَّه إلى الدخول ولا يُبنى له تخزين
 * موازٍ في المتصفّح: مفضّلة لا تُزامَن وتضيع عند مسح البيانات تَعِد
 * بما لا تفي به.
 */

export type WishlistItem = {
  productId: string; name: string; slug: string;
  price: number; compareAtPrice: number | null;
  hasVariants: boolean; trackInventory: boolean;
  available: number;
  /** الدلو والمسار كما هما — بطاقة المنتج تبني الرابط بنفسها. */
  imageBucket: string | null; imagePath: string | null; imageBlur: string | null;
};

/** يضيف المنتج أو يزيله، ويعيد الحالة بعد العملية. */
export async function toggleWishlist(input: {
  host: string; productId: string;
}): Promise<ActionResult<{ inWishlist: boolean }>> {
  try {
    const actor = await getActor();
    if (actor.kind !== 'user') {
      throw errors.forbidden('سجّل الدخول لتحفظ منتجاتك المفضّلة');
    }

    // المتجر يُحلّ من الـhost للتحقّق من أنه متاح، لا لتمريره للقاعدة
    const store = await resolveStoreByHost(input.host);
    if (!store || store.status !== 'active') throw errors.notFound('المتجر غير متاح');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'toggle_wishlist', {
      p_product_id: input.productId,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    revalidatePath('/wishlist');
    return ok({ inWishlist: row.in_wishlist });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * أي من هذه المنتجات محفوظ — نداء واحد لشبكة كاملة.
 * يعيد مجموعة فارغة للزائر بلا خطأ: الشبكة تُعرض له كاملة بقلوب فارغة.
 */
export async function wishlistStateFor(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const actor = await getActor();
  if (actor.kind !== 'user') return new Set();

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'wishlist_state', {
    p_product_ids: productIds,
  });
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.product_id));
}

/** مفضّلة هذا المتجر للمستخدم الحالي. */
export async function loadWishlist(host: string): Promise<ActionResult<WishlistItem[]>> {
  try {
    const actor = await getActor();
    if (actor.kind !== 'user') {
      throw errors.forbidden('سجّل الدخول لعرض مفضّلتك');
    }
    const store = await resolveStoreByHost(host);
    if (!store || store.status !== 'active') throw errors.notFound('المتجر غير متاح');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'my_wishlist', {
      p_store_id: store.storeId,
    });
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((r) => ({
      productId: r.product_id,
      name: r.name,
      slug: r.slug,
      price: Number(r.price),
      compareAtPrice: r.compare_at_price === null ? null : Number(r.compare_at_price),
      hasVariants: r.has_variants,
      trackInventory: r.track_inventory,
      available: r.available,
      imageBucket: r.image_bucket,
      imagePath: r.image_path,
      imageBlur: r.image_blur,
    })));
  } catch (err) {
    return actionError(err);
  }
}
