'use server';
import 'server-only';
import { cache } from 'react';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { normalizePhone } from '@/lib/phone';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { getActor } from '@/lib/auth/actor';
import { ensureCartToken, readCartToken, setLastOrder } from './token';
import { publicUrl } from '@/lib/media/url';

/**
 * أفعال السلة والدفع في المتجر.
 *
 * ★ storeId يُشتق من الـhost حصريًا في كل فعل — لا يُقبل من النموذج
 * ولا من الرابط. الفعل يستقبل `host` (من مسار /sites/[host]) ويحلّه
 * بنفسه، فلا يستطيع زبون متجر أن يكتب في متجر آخر.
 *
 * ★ لا مبلغ يُرسل من المتصفح: كل سعر ورسم وخصم يُحسب في القاعدة
 * (D10). النماذج ترسل معرّفات وكميات وبيانات اتصال فقط.
 */

async function storeFor(host: string) {
  const store = await resolveStoreByHost(host);
  if (!store || store.status !== 'active') throw errors.notFound('المتجر غير متاح');
  return store;
}

export type CartLine = {
  itemId: string; productId: string; variantId: string | null;
  productName: string; variantName: string | null; productSlug: string;
  unitPrice: number; quantity: number; lineTotal: number;
  available: number; imageUrl: string | null;
};

/**
 * ★ لماذا يعيد كل فعل `cartCount`:
 *
 * كان المتصفّح بعد كل «أضف إلى السلة» ينادي `router.refresh()`
 * لتحديث رقم واحد في الترويسة، و`revalidatePath` يُبطل المسار فوقه.
 * قياسٌ فعلي على نسخة إنتاج: نقرة واحدة = **١٩ نداءً** إلى القاعدة،
 * وإعادة بناء كاملة للمسار مرّتين، وزيارتان مسجَّلتان في الإحصاءات
 * لم يقم بهما أحد.
 *
 * الآن الفعل يقرأ السلة مرّة ويعيد العدد، فيحدّث `CartBadge` نفسه:
 * نداءان بدل تسعة عشر، ولا تعاد كتابة الصفحة تحت يد الزبون.
 */
export async function addToCart(input: {
  host: string; productId: string; quantity?: number; variantId?: string | null;
}): Promise<ActionResult<{ quantity: number; cartCount: number }>> {
  try {
    const store = await storeFor(input.host);
    const actor = await getActor();

    // الزائر يحتاج توكنًا؛ المسجَّل سلته مربوطة بحسابه فلا يحتاجه
    const token = actor.kind === 'user' ? null : await ensureCartToken(input.host);

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'cart_add_item', {
      p_store_id: store.storeId,
      p_product_id: input.productId,
      p_quantity: Math.max(1, Math.trunc(input.quantity ?? 1)),
      p_variant_id: input.variantId ?? null,
      p_anon_token: token,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    return ok({ quantity: row.quantity, cartCount: await cartCount(input.host) });
  } catch (err) {
    return actionError(err);
  }
}

export async function setCartQuantity(input: {
  host: string; itemId: string; quantity: number;
}): Promise<ActionResult<{ cartCount: number }>> {
  try {
    const store = await storeFor(input.host);
    const token = await readCartToken(input.host);

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'cart_set_quantity', {
      p_store_id: store.storeId,
      p_item_id: input.itemId,
      p_quantity: Math.max(0, Math.trunc(input.quantity)),
      p_anon_token: token,
    });
    if (error) throw fromPostgres(error);

    return ok({ cartCount: await cartCount(input.host) });
  } catch (err) {
    return actionError(err);
  }
}

/** عدد القطع في السلة — رقم الترويسة، من القاعدة لا من تخمين. */
async function cartCount(host: string): Promise<number> {
  const lines = await loadCart(host);
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** يُنادى بعد تسجيل الدخول: سلة الزائر تنضم إلى سلة الحساب. */
export async function mergeGuestCart(host: string): Promise<ActionResult<{ merged: number }>> {
  try {
    const store = await storeFor(host);
    const token = await readCartToken(host);
    if (!token) return ok({ merged: 0 });

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'cart_merge_guest', {
      p_store_id: store.storeId, p_anon_token: token,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/sites/${host}/cart`);
    return ok({ merged: firstRow(data)?.merged ?? 0 });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * قراءة السلة — تُستخدم من الصفحات ومن الأفعال بعد كل تغيير.
 *
 * ★ `cache` من React: التخطيط يقرأ السلة لعدّاد الترويسة وصفحة
 * السلة تقرأها للأسطر، فكان النداء يتكرّر في الطلب الواحد. الآن
 * نداء واحد ونتيجة واحدة — ولا تخزين بين الطلبات: السلة تخصّ
 * زائرًا بعينه ولا يجوز أن تُشارَك.
 */
export const loadCart = cache(async (host: string): Promise<CartLine[]> => {
  const store = await resolveStoreByHost(host);
  if (!store) return [];
  const token = await readCartToken(host);

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'get_cart', {
    p_store_id: store.storeId, p_anon_token: token,
  });
  if (error || !data) return [];

  return data.map((r) => ({
    itemId: r.item_id,
    productId: r.product_id,
    variantId: r.variant_id,
    productName: r.product_name,
    variantName: r.variant_name,
    productSlug: r.product_slug,
    unitPrice: Number(r.unit_price),
    quantity: r.quantity,
    lineTotal: Number(r.line_total),
    available: r.available,
    imageUrl: r.image_bucket && r.image_path
      ? publicUrl(r.image_bucket, r.image_path) : null,
  }));
});

export type Quote = {
  subtotal: number; deliveryFee: number; discountTotal: number; total: number;
  couponValid: boolean; couponMessage: string | null;
  canCheckout: boolean; outOfStock: boolean; itemCount: number;
};

export async function quoteCart(input: {
  host: string; zoneId?: string | null; couponCode?: string | null;
}): Promise<ActionResult<Quote>> {
  try {
    const store = await storeFor(input.host);
    const token = await readCartToken(input.host);

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'quote_checkout', {
      p_store_id: store.storeId,
      p_anon_token: token,
      p_zone_id: input.zoneId ?? null,
      p_coupon_code: input.couponCode ?? null,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    return ok({
      subtotal: Number(row.subtotal),
      deliveryFee: Number(row.delivery_fee),
      discountTotal: Number(row.discount_total),
      total: Number(row.total),
      couponValid: row.coupon_valid,
      couponMessage: row.coupon_message,
      canCheckout: row.can_checkout,
      outOfStock: row.out_of_stock,
      itemCount: row.item_count,
    });
  } catch (err) {
    return actionError(err);
  }
}

export type PlacedOrder = { orderNumber: string; total: number };

/**
 * إتمام الطلب.
 * المتصفح يرسل: منطقة التوصيل · الكوبون · بيانات الاتصال · العنوان ·
 * طريقة الدفع. لا سعر ولا إجمالي — القاعدة تحسب كل شيء وتحجز المخزون
 * في نفس المعاملة.
 */
export async function placeOrder(input: {
  host: string;
  zoneId: string | null;
  couponCode: string | null;
  paymentMethod: 'cash_on_delivery' | 'bank_transfer' | 'bankak';
  contact: { name: string; phone: string; email?: string };
  address: { line: string; landmark?: string };
  note?: string;
  idempotencyKey: string;
  /** إيصال التحويل — إلزامي في التحويل البنكي وبنكك. */
  proofMediaId?: string | null;
  /** رقم العملية كما كتبه الزبون — للمطابقة لا للتأكيد. */
  paymentReference?: string;
}): Promise<ActionResult<PlacedOrder>> {
  try {
    const store = await storeFor(input.host);

    const name = input.contact.name.trim();
    // ★ يُوحَّد قبل الفحص لا بعده: `0912345678` و`+249912345678`
    // رقمٌ واحد، وتخزينهما مختلفَين يعني عميلين في جدول العملاء.
    const phone = normalizePhone(input.contact.phone) ?? '';
    if (name.length < 2) throw errors.validation('الاسم مطلوب', 'name');
    if (phone.replace(/\D/g, '').length < 9)
      throw errors.validation('رقم هاتف صحيح مطلوب', 'phone');
    if (input.address.line.trim().length < 5)
      throw errors.validation('العنوان مطلوب', 'address');
    if (!input.idempotencyKey) throw errors.validation('مفتاح الطلب مفقود');

    // السلة تُقرأ من القاعدة، لا من المتصفح ⇒ لا يُدسّ منتج ولا كمية
    const lines = await loadCart(input.host);
    if (lines.length === 0) throw errors.validation('السلة فارغة');

    const items = lines.map((l) => ({
      product_id: l.productId,
      variant_id: l.variantId,
      quantity: l.quantity,
    }));
    const contact = { name, phone, email: input.contact.email?.trim() || null };
    const address = {
      line: input.address.line.trim(),
      landmark: input.address.landmark?.trim() || null,
    };

    const supabase = await createClient();

    // ★ التحويل البنكي وبنكك يمرّان بمسار الإيصال حصريًا: الطلب
    // والدفعة المعلّقة يُكتبان في معاملة واحدة، والقاعدة ترفض طلب
    // تحويل بلا إيصال أيًّا كان المنادي (قيد مؤجَّل في 0045).
    const byTransfer =
      input.paymentMethod === 'bank_transfer' || input.paymentMethod === 'bankak';

    if (byTransfer && !input.proofMediaId) {
      throw errors.validation('أرفق إيصال التحويل لإتمام الطلب', 'proof');
    }

    const { data, error } = byTransfer
      ? await rpc(supabase, 'create_order_with_proof', {
        p_store_id: store.storeId,
        p_items: items,
        p_zone_id: input.zoneId,
        p_contact: contact,
        p_address: address,
        p_payment_method: input.paymentMethod as 'bank_transfer' | 'bankak',
        p_proof_media_id: input.proofMediaId!,
        p_coupon_code: input.couponCode,
        p_idempotency_key: input.idempotencyKey,
        p_note: input.note?.trim() || null,
        p_reference: input.paymentReference?.trim() || null,
        p_anon_token: await readCartToken(input.host),
      })
      : await rpc(supabase, 'create_order', {
        p_store_id: store.storeId,
        p_items: items,
        p_zone_id: input.zoneId,
        p_contact: contact,
        p_address: address,
        p_payment_method: input.paymentMethod,
        p_coupon_code: input.couponCode,
        p_idempotency_key: input.idempotencyKey,
        p_note: input.note?.trim() || null,
      });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.internal();

    // توكن الطلب في كوكي HttpOnly ⇒ صفحة التأكيد تعمل للزائر بلا حساب
    await setLastOrder(input.host, row.order_number, row.guest_token);
    // ملاحظة: كوكي السلة لا يُحذف — القاعدة وسمت السلة `converted`،
    // ونفس التوكن يخدم سلة جديدة إن عاد الزبون.
    revalidatePath(`/sites/${input.host}/cart`);

    return ok({ orderNumber: row.order_number, total: Number(row.total) });
  } catch (err) {
    return actionError(err);
  }
}
