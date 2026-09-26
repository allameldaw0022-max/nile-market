'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { ensureCartToken, readCartToken } from '@/lib/cart/token';
import { setLastOrder, readLastOrder } from '@/lib/cart/token';
import { normalizePhone } from '@/lib/phone';

/**
 * الشراء الرقمي — مسارٌ مستقلّ يستدعي المنطق القائم، لا نسخةٌ منه.
 *
 * ★★ لماذا مسار مستقلّ عن `placeOrder`: الطلب الرقمي يختلف في أربعة
 * أشياء (لا عنوان · لا منطقة توصيل · سطرٌ واحد · حقول إلزامية)،
 * وحشرها كأربع شُرَط داخل `placeOrder` كان يعني تعديل أكثر مسار
 * حرجٍ في المتجر العادي. فالمسار منفصل و**يستدعي**
 * `create_digital_order` التي تستدعي `create_order_with_proof` —
 * فحساب المال والمخزون ومفتاح عدم التكرار وقيد «تحويلٌ بلا إيصال لا
 * يُكتب» كلّها المنطق القائم نفسه بلا سطرٍ مكرَّر.
 *
 * ★★ ولا سعر ولا إجمالي يأتي من المتصفح: القاعدة تقرأ سعر الباقة من
 * `product_variants` وتحسب الإجمالي. وما يرسله العميل مُعرِّفاتٌ
 * تُتحقَّق كلّها داخل المتجر المشتقّ من المضيف.
 */

async function storeFor(host: string) {
  const store = await resolveStoreByHost(host);
  if (!store || store.status !== 'active') {
    throw errors.notFound('المتجر غير متاح');
  }
  return store;
}

/**
 * يضبط سلّة المتجر على **سطر واحد** (§١٦).
 *
 * الإيصال يُرفَع بشرط سلّة غير فارغة (`prepare_order_proof_upload`)،
 * و`create_order_with_proof` تربط الإيصال بالسلّة — فالسلّة جزءٌ من
 * مسار الدفع القائم لا خطوةٌ زائدة. وهذا الفعل يستعملها كما هي
 * ويحصرها على سطر: كل سطر آخر يُصفَّر بـ`cart_set_quantity(0)`
 * القائمة، فلا حذفٌ مباشر ولا منطق سلّة ثانٍ.
 */
export async function setDigitalCartLine(input: {
  host: string; productId: string; variantId: string | null; quantity: number;
}): Promise<ActionResult<{ lines: number }>> {
  try {
    const store = await storeFor(input.host);
    const qty = Math.min(Math.max(Math.trunc(input.quantity) || 1, 1), 99);

    const supabase = await createClient();
    const token = await ensureCartToken(input.host);

    const { data: current } = await rpc(supabase, 'get_cart', {
      p_store_id: store.storeId, p_anon_token: token,
    });
    for (const line of current ?? []) {
      const { error } = await rpc(supabase, 'cart_set_quantity', {
        p_store_id: store.storeId, p_item_id: line.item_id,
        p_quantity: 0, p_anon_token: token,
      });
      if (error) throw fromPostgres(error);
    }

    const { error } = await rpc(supabase, 'cart_add_item', {
      p_store_id: store.storeId,
      p_product_id: input.productId,
      p_variant_id: input.variantId,
      p_quantity: qty,
      p_anon_token: token,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/sites/${input.host}/cart`);
    return ok({ lines: 1 });
  } catch (err) {
    return actionError(err);
  }
}

export type DigitalPlaced = {
  orderNumber: string; total: number;
};

export async function placeDigitalOrder(input: {
  host: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  contact: { name: string; phone: string; email?: string };
  fields: { label: string; value: string }[];
  paymentMethod: 'bank_transfer' | 'bankak';
  proofMediaId: string;
  paymentReference?: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<DigitalPlaced>> {
  try {
    const store = await storeFor(input.host);

    const name = input.contact.name.trim();
    // يُوحَّد قبل الفحص: `0912345678` و`+249912345678` رقمٌ واحد
    const phone = normalizePhone(input.contact.phone) ?? '';
    if (name.length < 2) throw errors.validation('الاسم مطلوب', 'name');
    if (phone.replace(/\D/g, '').length < 9) {
      throw errors.validation('رقم هاتف صحيح مطلوب', 'phone');
    }
    if (!input.proofMediaId) {
      throw errors.validation('أرفق إيصال التحويل لإتمام الطلب', 'proof');
    }
    if (!input.idempotencyKey) throw errors.validation('مفتاح الطلب مفقود');

    // ★ الحقول تُرسَل كما أدخلها العميل، و**القاعدة** هي التي تقرّر
    //   أيُّها مطلوب وترفض الناقص. لا اعتماد على تحقّق الواجهة.
    const fields = input.fields
      .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label.length > 0);

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'create_digital_order', {
      p_store_id: store.storeId,
      p_product_id: input.productId,
      p_variant_id: input.variantId,
      p_quantity: Math.min(Math.max(Math.trunc(input.quantity) || 1, 1), 99),
      p_contact: { name, phone, email: input.contact.email?.trim() || null },
      p_payment_method: input.paymentMethod,
      p_proof_media_id: input.proofMediaId,
      p_fields: fields,
      p_idempotency_key: input.idempotencyKey,
      p_note: input.note?.trim() || null,
      p_reference: input.paymentReference?.trim() || null,
      p_anon_token: await readCartToken(input.host),
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.internal();

    // توكن الطلب في كوكي HttpOnly ⇒ صفحة النجاح تعمل للزائر بلا حساب
    await setLastOrder(input.host, row.order_number, row.guest_token);
    revalidatePath(`/sites/${input.host}/cart`);

    return ok({ orderNumber: row.order_number, total: Number(row.total) });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * ربط طلب الزائر بحسابه بعد الدخول بـGoogle.
 *
 * ★ لا يُبنى Auth جديد: الجلسة من `@/lib/supabase/server` القائم،
 * والتوكن من كوكي الطلب HttpOnly — فلا رقم طلبٍ ولا توكن يمرّ في
 * رابط ولا في نموذج. والقاعدة تفرض حدّ المعدّل ومطابقة التوكن.
 */
export async function claimMyOrder(host: string): Promise<ActionResult<{
  orderNumber: string;
}>> {
  try {
    const store = await storeFor(host);
    const last = await readLastOrder(host);
    if (!last?.orderNumber || !last.guestToken) {
      throw errors.validation('لا طلب حديث لربطه');
    }

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'claim_guest_order', {
      p_store_id: store.storeId,
      p_order_number: last.orderNumber,
      p_guest_token: last.guestToken,
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.validation('تعذّر ربط الطلب');

    revalidatePath(`/sites/${host}/account`);
    return ok({ orderNumber: row.order_number });
  } catch (err) {
    return actionError(err);
  }
}
