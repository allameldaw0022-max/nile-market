/**
 * روابط ملفات التخزين.
 *
 * الـbuckets العامة تُخدَم مباشرة بلا توقيع؛ الخاصة تحتاج رابطًا موقّتًا
 * يُولَّد خادميًا فقط (لا يُبنى في المتصفح إطلاقًا).
 */
const PUBLIC_BUCKETS = new Set(['store-public', 'avatars']);

export function isPublicBucket(bucket: string): boolean {
  return PUBLIC_BUCKETS.has(bucket);
}

/** رابط ثابت لملف في bucket عام. */
export function publicUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

/** رابط ملف مخزَّن — يعيد null للـbuckets الخاصة (تحتاج توقيعًا خادميًا). */
export function mediaUrl(
  media: { bucket: string; path: string } | null | undefined,
): string | null {
  if (!media) return null;
  return isPublicBucket(media.bucket) ? publicUrl(media.bucket, media.path) : null;
}
