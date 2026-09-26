'use client';
import Link from 'next/link';
import { useViewer } from './ViewerProvider';

/**
 * سطر إضافي لصاحب متجر لم يُنشره بعد.
 *
 * ★ سببه أنّ 404 عامًّا كان يحيّر صاحب المتجر: يفتح رابطه فيرى
 * «غير موجود» ولا يعرف أنّ السبب أنّه لم ينشره. وهي أشيع حالة في
 * المنصّة — معظم المتاجر تبقى مسوّدة حتى يُنشرها صاحبها.
 *
 * ★ والملكية تُقرأ من `/viewer` بعد الإماهة لا أثناء التصيير: صفحة
 * الإشعار تُخدَم من التخزين مثل بقية صفحات المتجر، فلا يجوز أن
 * يدخل في HTML-ها شيءٌ يخصّ زائرًا بعينه. والزائر العادي لا يرى
 * السطر ولا يعرف من القالب أنّ هناك سطرًا.
 */
export function DraftOwnerHint() {
  const { owner } = useViewer();

  if (!owner) {
    return (
      <p className="mt-2 text-sm text-ink-500">
        إن كنت صاحب المتجر، سجّل الدخول إلى لوحة التحكم لمعرفة التفاصيل.
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        متجرك جاهز على هذا الرابط، ولا يراه الزبائن حتى تنشره.
        افتح لوحة التحكم واضغط «نشر المتجر».
      </p>
      <Link href="/dashboard"
            className="mt-4 inline-flex h-11 items-center justify-center
                       rounded-md bg-teal-600 px-5 font-bold text-white">
        انشر متجرك الآن
      </Link>
    </>
  );
}
