'use server';
import 'server-only';
// updateTag: read-your-own-writes داخل Server Action — يُبطل فورًا
// فيرى التاجر تغييره مباشرة بدل محتوى قديم (Next 16).
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { AppError, errors, fromPostgres } from '@/lib/authz/errors';
import { storeTag } from '@/lib/tenant/resolve';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string;
      action?: { label: string; href: string } };

function toResult(err: unknown): ActionResult<never> {
  const e = err instanceof AppError ? err : errors.internal();
  return { ok: false, code: e.code, message: e.message, action: e.action };
}

const slugify = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
    .slice(0, 50) || `p-${Date.now()}`;

/**
 * إنشاء منتج.
 * الترتيب الملزم لكل Server Action: تحقق ← سلطة ← حد الباقة ← عملية
 * ← إبطال cache. (API.md §12.2)
 */
export async function createProduct(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    // 1) تحقق من المدخلات
    const storeId = String(formData.get('store_id') ?? '');
    const name = String(formData.get('name') ?? '').trim();
    const priceRaw = String(formData.get('price') ?? '').trim();
    const price = Number(priceRaw);

    if (!storeId) throw errors.validation('المتجر غير محدد');
    if (name.length < 2) throw errors.validation('اسم المنتج مطلوب', 'name');
    if (!Number.isFinite(price) || price < 0)
      throw errors.validation('أدخل سعرًا صحيحًا', 'price');

    // 2) سلطة — الجدار الأول
    const { membership } = await requireStoreAccess(storeId, 'products:create');

    const supabase = await createClient();

    // 3) حد الباقة — يُفحص في القاعدة أيضًا داخل نفس المعاملة
    const { error: limitError } = await supabase
      .rpc('assert_within_limit' as never, {
        p_store_id: membership.storeId, p_key: 'products.max',
      } as never);
    if (limitError) throw fromPostgres(limitError);

    // 4) العملية
    const { data, error } = await supabase
      .from('products')
      .insert({
        store_id: membership.storeId,
        name,
        slug: slugify(name),
        price,
        description: String(formData.get('description') ?? '').trim() || null,
        sku: String(formData.get('sku') ?? '').trim() || null,
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) throw fromPostgres(error);

    // 5) إبطال دقيق بالوسم لا بالزمن (§18.2)
    updateTag(storeTag(membership.storeId, 'products'));

    return { ok: true, data: { id: data.id } };
  } catch (err) {
    return toResult(err);
  }
}

/** تغيير حالة الطلب — يمر حصريًا بدالة القاعدة transition_order. */
export async function transitionOrder(
  storeId: string, orderId: string, to: string, reason?: string,
): Promise<ActionResult> {
  try {
    await requireStoreAccess(
      storeId,
      to === 'cancelled' ? 'orders:cancel' : 'orders:update',
    );

    const supabase = await createClient();
    const { error } = await supabase.rpc('transition_order', {
      p_order_id: orderId,
      p_to: to as never,
      p_reason: reason ?? undefined,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(storeId, 'orders'));
    return { ok: true, data: undefined };
  } catch (err) {
    return toResult(err);
  }
}
