'use server';
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { readCartToken } from './token';

/**
 * إيصال تحويل الزبون — الوجه المقابل لـ`lib/media/actions.ts`.
 *
 * ★ لماذا باب مستقل؟ `prepare_upload` تشترط صلاحية **عضو** في
 * المتجر لكل أغراضها، وزبون المتجر ليس عضوًا فيه ولن يكون. الشرط
 * هنا مختلف بطبيعته: سلة نشطة غير فارغة في هذا المتجر — تثبتها
 * كوكي HttpOnly لا حقل في النموذج.
 *
 * ★ `storeId` يُشتق من المضيف حصريًا، كبقية أفعال المتجر: زبون متجر
 * لا يرفع إيصالًا باسم متجر آخر ولو زوّر الحقل.
 *
 * ★ الاسم والمسار يُولَّدان في القاعدة. المتصفح يرفع إلى المسار
 * الذي أصدرته له وحده، وتنتهي صلاحية ذلك المسار للكتابة فور اكتمال
 * الرفع — قدرة لمرة واحدة لا فتحٌ للدلو الخاص.
 */

/** الأنواع المقبولة — مطابقة لإعداد الدلو `store-private` في 0015. */
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
] as const;

export type ReceiptTicket = { mediaId: string; bucket: string; path: string };

export async function beginOrderReceiptUpload(input: {
  host: string; mime: string; size: number;
}): Promise<ActionResult<ReceiptTicket>> {
  try {
    const store = await resolveStoreByHost(input.host);
    if (!store || store.status !== 'active') throw errors.notFound('المتجر غير متاح');

    // فحص مبكر لرسالة واضحة — القاعدة تعيد الفحص وهي الحاجز
    if (!(ALLOWED_MIME as readonly string[]).includes(input.mime)) {
      throw errors.validation('أرفق صورة (JPG أو PNG أو WebP) أو ملف PDF');
    }
    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw errors.validation('ملف فارغ');
    }

    const ext = input.mime === 'application/pdf' ? 'pdf'
      : input.mime === 'image/png' ? 'png'
      : input.mime === 'image/webp' ? 'webp' : 'jpg';

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'prepare_order_proof_upload', {
      p_store_id: store.storeId,
      p_anon_token: await readCartToken(input.host),
      p_mime: input.mime,
      p_size: Math.round(input.size),
      p_ext: ext,
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.internal();
    return ok({ mediaId: row.media_id, bucket: row.bucket, path: row.path });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * بيانات تحويل المتجر قبل إتمام الطلب.
 * تُفتح لمن له سلة غير فارغة في هذا المتجر فقط — `bank_accounts`
 * ليست حقلًا عامًا في صفحة المتجر.
 */
export async function checkoutPaymentInfo(host: string): Promise<{
  accounts: { bank?: string; account?: string; holder?: string; logo?: string }[];
  bankak: string | null;
}> {
  const store = await resolveStoreByHost(host);
  if (!store) return { accounts: [], bankak: null };

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'checkout_payment_info', {
    p_store_id: store.storeId,
    p_anon_token: await readCartToken(host),
  });
  if (error) return { accounts: [], bankak: null };

  const row = firstRow(data);
  return {
    accounts: Array.isArray(row?.bank_accounts) ? row.bank_accounts : [],
    bankak: row?.bankak_number ?? null,
  };
}
