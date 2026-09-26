'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { mergeGuestCart } from '@/lib/cart/actions';
import { useViewer } from './ViewerProvider';

/**
 * يدمج سلة الزائر في سلة الحساب بعد تسجيل الدخول.
 *
 * ★ الشرط من `ViewerProvider` لا من الخادم: حسابٌ مسجَّل **و**توكن
 * سلة زائر. حسابه خادميًا في التخطيط كان يقرأ الكوكيز في كل صفحة
 * متجر، فيمنع تخزينها.
 *
 * ★ ومرّة واحدة لكل جلسة متصفّح: سلّة الزائر لا تنشأ إلا **قبل**
 * الدخول، فدمجٌ واحد بعده يكفي. بلا هذا الحدّ كان الدمج يُنادى في
 * كل تنقّل لكل مستخدم مسجَّل — رحلة خادم لا تفعل شيئًا.
 *
 * ★ والدمج نفسه في القاعدة (`cart_merge_guest`) يجمع الكميات على
 * الفهرس الفريد، فتكراره لا يضاعف شيئًا.
 */
export function GuestCartMerger({ host }: { host: string }) {
  const router = useRouter();
  const { signedIn, needsMerge, refresh } = useViewer();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !signedIn || !needsMerge) return;
    const key = `nm_merged_${host}`;
    try { if (sessionStorage.getItem(key)) { done.current = true; return; } }
    catch { /* تخزين الجلسة محجوب — يُدمج مرّة لكل تحميل */ }

    done.current = true;
    void mergeGuestCart(host).then((res) => {
      try { sessionStorage.setItem(key, '1'); } catch { /* لا شيء */ }
      if (res.ok && res.data.merged > 0) { refresh(); router.refresh(); }
    });
  }, [host, router, signedIn, needsMerge, refresh]);

  return null;
}
