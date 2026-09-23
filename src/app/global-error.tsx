'use client';
import './globals.css';

/**
 * حدّ الخطأ الجذري — يُستدعى حين يفشل التخطيط الجذري نفسه.
 *
 * ★ يستبدل `<html>` و`<body>`، فلا يرث `lang` ولا `dir` — يُعادان
 * هنا وإلا ظهرت رسالة عربية بمحاذاة إنجليزية. الخطّ عمدًا **لا**
 * يُحمَّل: `next/font` طبقة إضافية قد تكون هي نفسها سبب السقوط،
 * و`--font-sans` يسقط إلى `system-ui` فتبقى الرسالة مقروءة.
 * ولا يستورد مكوّنات المشروع للسبب نفسه.
 */
export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="min-h-full antialiased">
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-xl font-extrabold text-ink-900">تعذّر تحميل الصفحة</h1>
          <p className="mt-2 text-sm text-ink-500">
            حدث خطأ غير متوقّع. أعد المحاولة، وإن تكرّر راسل الدعم بالرقم المرجعي.
          </p>
          {error.digest && (
            <p className="mt-3 text-xs text-ink-500">
              رقم مرجعي: <span className="font-mono">{error.digest}</span>
            </p>
          )}
          <button type="button" onClick={reset}
                  className="mt-6 rounded-md bg-teal-600 px-4 py-2 text-sm
                             font-bold text-white hover:bg-teal-700">
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
