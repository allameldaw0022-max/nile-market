'use server';
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireStoreAccess } from '@/lib/authz/guards';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc, type MediaPurpose } from '@/lib/supabase/rpc';
import { isPublicBucket, publicUrl } from './url';

/**
 * الرفع على مرحلتين:
 *
 *  1) beginUpload  — القاعدة تتحقق من الصلاحية والنوع والحجم وحصة الباقة،
 *                    ثم **تولّد** اسم الملف ومساره. الاسم لا يأتي من
 *                    المتصفح إطلاقًا ⇒ لا Path Traversal ولا تصادم.
 *  2) الرفع نفسه   — من المتصفح مباشرة إلى Storage، خاضعًا لسياسات
 *                    storage.objects. الملف لا يمر بالسيرفر ⇒ لا حد
 *                    4.5MB على الـServer Action ولا تكلفة نقل مضاعفة.
 *  3) completeUpload — توسيم الملف جاهزًا. الملف الذي لا يكتمل يبقى
 *                    `pending` ولا يُربط بأي منتج (تنظيفه وظيفة مجدولة).
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** الصلاحية المطلوبة لكل غرض — مطابقة لما تفرضه prepare_upload. */
const PERMISSION_BY_PURPOSE = {
  product_image: 'products:update',
  store_logo: 'settings:update',
  store_banner: 'settings:update',
  category_image: 'categories:manage',
  payment_proof: 'settings:view',
  import_file: 'products:create',
  export_file: 'export:data',
} as const;

export type UploadTicket = {
  mediaId: string; bucket: string; path: string;
};

export async function beginUpload(input: {
  storeId: string;
  // `order_payment_proof` ليس هنا عمدًا: يرفعه زبون المتجر لا عضوه،
  // وله بابه المستقل في `lib/cart/receipt.ts` بشرط سلة لا بشرط صلاحية.
  purpose: Exclude<MediaPurpose,
    'avatar' | 'support_attachment' | 'order_payment_proof'>;
  mime: string;
  size: number;
}): Promise<ActionResult<UploadTicket>> {
  try {
    const permission = PERMISSION_BY_PURPOSE[input.purpose];
    const { membership } = await requireStoreAccess(input.storeId, permission);

    const ext = EXT_BY_MIME[input.mime];
    // النوع يُتحقق مرة أخرى في القاعدة من إعداد الـbucket — هذا فحص مبكر
    // ليعطي المستخدم رسالة واضحة قبل الرفع.
    if (!ext) throw errors.validation('نوع الملف غير مدعوم');
    if (!Number.isFinite(input.size) || input.size <= 0)
      throw errors.validation('ملف فارغ');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'prepare_upload', {
      p_store_id: membership.storeId,
      p_purpose: input.purpose,
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

export async function completeUpload(input: {
  storeId: string;
  mediaId: string;
  width?: number | null;
  height?: number | null;
}): Promise<ActionResult<{ url: string | null; mediaId: string }>> {
  try {
    await requireStoreAccess(input.storeId);
    const supabase = await createClient();

    const { error } = await rpc(supabase, 'finalize_upload', {
      p_media_id: input.mediaId,
      p_width: input.width ?? null,
      p_height: input.height ?? null,
    });
    if (error) throw fromPostgres(error);

    const { data: media, error: readError } = await supabase
      .from('media_files')
      .select('bucket, path, status')
      .eq('id', input.mediaId)
      .maybeSingle();
    if (readError) throw fromPostgres(readError);
    if (!media) throw errors.notFound();
    if (media.status !== 'ready') throw errors.internal();

    return ok({
      mediaId: input.mediaId,
      url: isPublicBucket(media.bucket) ? publicUrl(media.bucket, media.path) : null,
    });
  } catch (err) {
    return actionError(err);
  }
}
