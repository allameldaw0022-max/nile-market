'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { rpc } from '@/lib/supabase/rpc';
import { storeTag } from '@/lib/tenant/resolve';

/**
 * خيارات المنتج — ألوان ومقاسات.
 *
 * ★★ النظام كان يدعمها من أوّله إلى آخره (جدول · مخزون لكل خيار ·
 * سلّة · لقطة في الطلب · مُختار في صفحة المنتج) إلا دالّة كتابةٍ
 * وشاشة. فلم يُنشئ تاجرٌ خيارًا واحدًا منذ الإطلاق. هذه هي الوصلة.
 *
 * ★ والسعر والمخزون والسقف كلها في `save_variant` داخل معاملة واحدة:
 *   الواجهة لا تحسب ولا تمنع (D10 · قاعدة ٦).
 */

export type ProductVariant = {
  id: string;
  /** قيمة الخيار كما يراها الزبون: «أحمر» أو «XL». */
  value: string;
  /** اسم المجموعة: «اللون» · «المقاس». واحدة لكل منتج في هذه المرحلة. */
  group: string;
  /** `null` ⇒ يرث سعر المنتج. */
  price: number | null;
  compareAtPrice: number | null;
  sku: string | null;
  isActive: boolean;
  /** الرصيد القابل للبيع (الكمّية ناقص المحجوز). */
  available: number;
  lowStockThreshold: number | null;
  sortOrder: number;
};

type VariantRow = {
  id: string; name: string; options: Record<string, string> | null;
  price: number | null; compare_at_price: number | null; sku: string | null;
  is_active: boolean; sort_order: number;
};

type StockRow = {
  variant_id: string | null; quantity: number; reserved: number;
  low_stock_threshold: number | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

/** اسم المجموعة من `options`: أوّل مفتاح. بلا مفاتيح ⇒ «الخيار». */
const groupOf = (options: Record<string, string> | null) =>
  Object.keys(options ?? {})[0] ?? 'الخيار';

/**
 * خيارات منتجٍ مع رصيد كل خيار.
 *
 * ★ الترشيح على `store_id` صريح فوق RLS: دفاع بالطبقات لا بديل عنها.
 */
export async function listProductVariants(
  storeId: string, productId: string,
): Promise<ActionResult<ProductVariant[]>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:view');
    const supabase = await createClient();

    const [variants, stock] = await Promise.all([
      supabase.from('product_variants')
        .select('id, name, options, price, compare_at_price, sku, is_active, sort_order')
        .eq('store_id', membership.storeId).eq('product_id', productId)
        .is('deleted_at', null)
        .order('sort_order').order('created_at'),
      supabase.from('inventory')
        .select('variant_id, quantity, reserved, low_stock_threshold')
        .eq('store_id', membership.storeId).eq('product_id', productId),
    ]);
    if (variants.error) throw fromPostgres(variants.error);
    if (stock.error) throw fromPostgres(stock.error);

    const byVariant = new Map<string, StockRow>();
    for (const row of (stock.data ?? []) as StockRow[])
      if (row.variant_id) byVariant.set(row.variant_id, row);

    return ok(((variants.data ?? []) as unknown as VariantRow[]).map((v) => {
      const s = byVariant.get(v.id);
      return {
        id: v.id,
        value: v.name,
        group: groupOf(v.options),
        price: num(v.price),
        compareAtPrice: num(v.compare_at_price),
        sku: v.sku,
        isActive: v.is_active,
        // الرصيد القابل للبيع لا الخام: المحجوز في طلبات معلّقة ليس متاحًا.
        available: Math.max((s?.quantity ?? 0) - (s?.reserved ?? 0), 0),
        lowStockThreshold: s?.low_stock_threshold ?? null,
        sortOrder: v.sort_order,
      };
    }));
  } catch (err) {
    return actionError(err);
  }
}

export type SaveVariantInput = {
  storeId: string;
  productId: string;
  variantId?: string | null;
  value: string;
  /** يُرسَل عند أوّل خيار فقط؛ بعده يرث المنتج مجموعته. */
  group?: string | null;
  price?: number | null;
  compareAtPrice?: number | null;
  sku?: string | null;
  isActive?: boolean;
  /** عند الإنشاء فقط — بعده تُسجَّل الكمّية كحركة مخزون. */
  initialQuantity?: number | null;
  lowStockThreshold?: number | null;
};

export async function saveProductVariant(
  input: SaveVariantInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const value = input.value.trim();
    if (value.length === 0)
      throw errors.validation('اكتب اسم الخيار (مثال: أحمر أو XL)', 'value');
    if (value.length > 60) throw errors.validation('اسم الخيار طويل جدًا', 'value');

    const { membership } = await requireStoreAccess(input.storeId, 'products:update');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'save_variant', {
      p_store_id: membership.storeId,
      p_product_id: input.productId,
      p_value: value,
      p_variant_id: input.variantId ?? null,
      p_group: input.group?.trim() || null,
      p_price: input.price ?? null,
      p_compare_at_price: input.compareAtPrice ?? null,
      p_sku: input.sku?.trim() || null,
      p_is_active: input.isActive ?? null,
      // الكمّية الابتدائية تُقبل عند الإنشاء وحده — بعده حركة مخزون
      // مسجَّلة من صفحة المخزون (قاعدة ٥).
      p_initial_quantity: input.variantId ? null : (input.initialQuantity ?? null),
      p_low_stock_threshold: input.lowStockThreshold ?? null,
    });
    if (error) throw fromPostgres(error);
    if (!data) throw errors.internal({ what: 'save_variant_returned_no_id' });

    updateTag(storeTag(membership.storeId, 'products'));
    return ok({ id: data });
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteProductVariant(
  storeId: string, variantId: string,
): Promise<ActionResult<true>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:update');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'delete_variant', {
      p_variant_id: variantId,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'products'));
    return ok(true as const);
  } catch (err) {
    return actionError(err);
  }
}
