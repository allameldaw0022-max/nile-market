'use client';
import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/States';

/**
 * حدّ الخطأ للتطبيق كلّه.
 *
 * ★ قبل هذا الملف لم يكن في المشروع أي `error.tsx`: أيّ استثناء —
 * في عرض صفحة أو في رفض استدعاء Server Action داخل transition —
 * كان يسقط إلى شاشة Next الافتراضية، بالإنجليزية وبلا سبب وبلا
 * طريق للعودة. التاجر يرى «الموقع معطَّل» بينما المعطَّل شيء واحد.
 *
 * ★ الـ`digest` يُعرض عمدًا: هو المفتاح الوحيد الذي يربط ما رآه
 * المستخدم بسطر السجلّ على الخادم. بدونه يبقى العطل قصّة بلا دليل.
 * الرمز نفسه لا يكشف شيئًا — النصّ الحقيقي يبقى خادميًا.
 */
export default function AppError({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary] خطأ غير معالَج', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <ErrorState
        title="تعذّر إتمام العملية"
        description="حدث خطأ غير متوقّع. يمكنك إعادة المحاولة — بياناتك لم تتأثّر."
        reference={error.digest}
        onRetry={reset}
      />
    </div>
  );
}
