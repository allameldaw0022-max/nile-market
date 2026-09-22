import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'دون اتصال',
  robots: { index: false, follow: false },
};

/**
 * صفحة «دون اتصال» — يعرضها عامل الخدمة حين تفشل الشبكة.
 *
 * ★ ثابتة تمامًا وبلا أي نداء بيانات: صفحة احتياطية تحتاج الشبكة
 * لعرضها ليست احتياطية.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <WifiOff size={44} strokeWidth={1.5} className="mx-auto text-sand-400" />
      <h1 className="mt-4 text-lg font-extrabold text-navy-900">لا يوجد اتصال</h1>
      <p className="mt-2 text-sm text-sand-600">
        تعذّر الوصول إلى الشبكة. الصفحات التي فتحتها سابقًا تعمل، وما
        عداها يحتاج اتصالًا.
      </p>
      <p className="mt-6 text-xs text-sand-600">
        أعد المحاولة بعد عودة الاتصال.
      </p>
    </div>
  );
}
