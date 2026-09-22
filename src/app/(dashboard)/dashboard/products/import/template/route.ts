import { toCsv } from '@/lib/import/csv';
import { getActor } from '@/lib/auth/actor';

/** ملف CSV نموذجي بترويسات يتعرّف عليها الاستيراد. */
export async function GET() {
  const actor = await getActor();
  if (actor.kind !== 'user') {
    return new Response('يجب تسجيل الدخول', { status: 401 });
  }

  const csv = toCsv([
    ['اسم المنتج', 'السعر', 'السعر قبل الخصم', 'رمز المنتج',
     'الكمية', 'التصنيف', 'الوصف'],
    ['قميص قطن رجالي', '20000', '25000', 'SH-001', '15', 'ملابس',
     'قطن 100% — مقاسات M · L · XL'],
    ['حزام جلد', '7500', '', 'BL-002', '8', 'أحزمة', ''],
  ]);

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="nile-market-products-template.csv"',
      'cache-control': 'no-store',
    },
  });
}
