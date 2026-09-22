'use server';
import 'server-only';
// updateTag: read-your-own-writes داخل Server Action — يُبطل فورًا
// فيرى التاجر تغييره مباشرة بدل محتوى قديم (Next 16).
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';
import { firstRow, rpc, type ImportError, type ImportRow, type ProductStatus } from '@/lib/supabase/rpc';

/**
 * الترتيب الملزم لكل Server Action هنا:
 *   تحقق ← سلطة (الجدار الأول) ← دالة القاعدة (الجدار الثاني والثالث)
 *   ← إبطال cache بالوسم. (API.md §12.2)
 *
 * المال والحدود والصلاحيات كلها تُحسب في `save_product` داخل معاملة
 * واحدة. الواجهة لا تُرسل أي قيمة محسوبة ولا تُعوَّل عليها في المنع.
 */

const STATUSES: ProductStatus[] = ['draft', 'active', 'hidden', 'archived'];

function num(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw errors.validation('أدخل رقمًا صحيحًا', key);
  return n;
}

function int(form: FormData, key: string): number | null {
  const n = num(form, key);
  return n === null ? null : Math.trunc(n);
}

function text(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? null : v;
}

export type SavedProduct = { id: string; slug: string };

/** إنشاء منتج أو تعديله. مصدر واحد للحفظ ⇒ لا تحقق مزدوج متباعد. */
export async function saveProduct(formData: FormData): Promise<ActionResult<SavedProduct>> {
  try {
    const storeId = String(formData.get('store_id') ?? '');
    const productId = text(formData, 'product_id');
    if (!storeId) throw errors.validation('المتجر غير محدد');

    const name = String(formData.get('name') ?? '').trim();
    if (name.length < 2) throw errors.validation('اسم المنتج مطلوب', 'name');

    const price = num(formData, 'price');
    if (price === null || price < 0)
      throw errors.validation('أدخل سعرًا صحيحًا', 'price');

    const statusRaw = text(formData, 'status');
    if (statusRaw && !STATUSES.includes(statusRaw as ProductStatus))
      throw errors.validation('حالة غير معروفة', 'status');

    const { membership } = await requireStoreAccess(
      storeId, productId ? 'products:update' : 'products:create',
    );

    const mediaIds = formData.getAll('image_media_ids')
      .map((v) => String(v)).filter(Boolean);

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'save_product', {
      p_store_id: membership.storeId,
      p_name: name,
      p_price: price,
      p_product_id: productId,
      p_slug: text(formData, 'slug'),
      p_description: text(formData, 'description'),
      p_compare_at_price: num(formData, 'compare_at_price'),
      p_cost_price: num(formData, 'cost_price'),
      p_sku: text(formData, 'sku'),
      p_category_id: text(formData, 'category_id'),
      p_status: (statusRaw as ProductStatus | null) ?? null,
      p_track_inventory: formData.get('track_inventory') === null
        ? null : formData.get('track_inventory') === 'on',
      p_weight_grams: int(formData, 'weight_grams'),
      // الكمية الابتدائية تُقبل عند الإنشاء فقط — بعده عبر adjustInventory
      p_initial_quantity: productId ? null : int(formData, 'quantity'),
      p_low_stock_threshold: int(formData, 'low_stock_threshold'),
      // مصفوفة فارغة ⇒ «أزل كل الصور»، وغياب الحقل ⇒ «لا تلمسها»
      p_image_media_ids: formData.has('images_touched') ? mediaIds : null,
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'products'));
    return ok({ id: row.product_id, slug: row.slug });
  } catch (err) {
    return actionError(err);
  }
}

/** نسخ منتج — النسخة مسودة بلا SKU ولا مخزون. */
export async function duplicateProduct(
  storeId: string, productId: string,
): Promise<ActionResult<SavedProduct>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:create');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'duplicate_product', {
      p_product_id: productId,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'products'));
    return ok({ id: row.product_id, slug: row.slug });
  } catch (err) {
    return actionError(err);
  }
}

/** حذف ناعم — الطلبات السابقة تحفظ لقطة نصية فلا يتأثر تاريخها. */
export async function deleteProduct(
  storeId: string, productId: string,
): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:delete');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'delete_product', { p_product_id: productId });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'products'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** تغيير حالة النشر من القائمة (نشر · إخفاء · أرشفة). */
export async function setProductStatus(
  storeId: string, productId: string, status: ProductStatus,
): Promise<ActionResult> {
  try {
    if (!STATUSES.includes(status)) throw errors.validation('حالة غير معروفة');
    const { membership } = await requireStoreAccess(storeId, 'products:update');

    const supabase = await createClient();
    const { data: current, error: readError } = await supabase
      .from('products')
      .select('name, price')
      .eq('id', productId).eq('store_id', membership.storeId)
      .is('deleted_at', null).maybeSingle();
    if (readError) throw fromPostgres(readError);
    if (!current) throw errors.notFound();

    const { error } = await rpc(supabase, 'save_product', {
      p_store_id: membership.storeId,
      p_name: current.name,
      p_price: current.price,
      p_product_id: productId,
      p_status: status,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'products'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** تعديل المخزون — يُسجَّل كحركة، لا كتابة مباشرة على الرصيد. */
export async function adjustInventory(input: {
  storeId: string; productId: string; delta: number;
  variantId?: string | null; note?: string; reason?: 'manual_adjust' | 'correction';
}): Promise<ActionResult<{ quantity: number }>> {
  try {
    if (!Number.isInteger(input.delta) || input.delta === 0)
      throw errors.validation('أدخل كمية صحيحة غير صفرية');

    const { membership } = await requireStoreAccess(input.storeId, 'inventory:update');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'adjust_inventory', {
      p_store_id: membership.storeId,
      p_product_id: input.productId,
      p_delta: input.delta,
      p_reason: input.reason ?? 'manual_adjust',
      p_variant_id: input.variantId ?? undefined,
      p_note: input.note ?? undefined,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'products'));
    return ok({ quantity: row.quantity });
  } catch (err) {
    return actionError(err);
  }
}

export type ImportOutcome = {
  imported: number; failed: number; errors: ImportError[];
};

/**
 * استيراد المنتجات.
 * `dryRun = true` مرحلة المعاينة: تُرجع نفس التحقق الذي سيُطبَّق عند
 * الكتابة بلا أي كتابة، فلا تتفاجأ الواجهة بنتيجة مختلفة بعد التأكيد.
 */
export async function importProducts(input: {
  storeId: string; rows: ImportRow[]; dryRun: boolean;
}): Promise<ActionResult<ImportOutcome>> {
  try {
    if (!Array.isArray(input.rows) || input.rows.length === 0)
      throw errors.validation('الملف لا يحتوي على صفوف');
    if (input.rows.length > 2000)
      throw errors.validation('الحد الأقصى 2000 صف في الملف الواحد');

    const { membership } = await requireStoreAccess(input.storeId, 'products:create');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'import_products', {
      p_store_id: membership.storeId,
      p_rows: input.rows,
      p_dry_run: input.dryRun,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    if (!input.dryRun) updateTag(storeTag(membership.storeId, 'products'));
    return ok({
      imported: row.imported, failed: row.failed,
      errors: Array.isArray(row.errors) ? row.errors : [],
    });
  } catch (err) {
    return actionError(err);
  }
}

/** إنشاء تصنيف بسرعة من نموذج المنتج. */
export async function createCategory(
  storeId: string, name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const clean = name.trim();
    if (clean.length < 2) throw errors.validation('اسم التصنيف مطلوب');
    const { membership } = await requireStoreAccess(storeId, 'categories:manage');

    const supabase = await createClient();
    const slug = clean.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-')
      .replace(/-{2,}/g, '-').replace(/^-|-$/g, '') || `c-${Date.now()}`;

    const { data, error } = await supabase
      .from('categories')
      .insert({ store_id: membership.storeId, name: clean, slug })
      .select('id, name').single();
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'products'));
    return ok({ id: data.id, name: data.name });
  } catch (err) {
    return actionError(err);
  }
}
