/**
 * ضغط الصور في المتصفح قبل الرفع.
 *
 * لماذا في المتصفح؟ صور الهواتف السودانية غالبًا 4-8MB، وحدود الدلاء
 * 5-10MB. الضغط هنا يوفّر باقة بيانات ووقتًا على 3G قبل أن يخرج
 * الملف أصلًا. إن فشل لأي سبب نرفع الأصل — القاعدة هي التي تقبل أو
 * ترفض في كل الحالات.
 *
 * ★ ما ليس صورة (PDF مثلًا) يمرّ كما هو: إعادة ترميزه تُفسده.
 */
const MAX_DIMENSION = 1600;

export type Compressed = {
  blob: Blob; mime: string; width: number; height: number;
};

export async function compressImage(
  file: File, quality = 0.85,
): Promise<Compressed> {
  const fallback = { blob: file as Blob, mime: file.type, width: 0, height: 0 };
  if (typeof document === 'undefined') return fallback;
  if (!file.type.startsWith('image/')) return fallback;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob || blob.size === 0) return fallback;
    return { blob, mime: 'image/webp', width, height };
  } catch {
    return fallback;
  }
}
