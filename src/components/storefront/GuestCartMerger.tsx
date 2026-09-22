'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { mergeGuestCart } from '@/lib/cart/actions';

/**
 * يدمج سلة الزائر في سلة الحساب بعد تسجيل الدخول.
 *
 * يُصيَّر فقط حين يكون الزائر مسجَّلًا ويحمل توكن سلة زائر، ويعمل مرة
 * واحدة لكل تحميل. الدمج نفسه في القاعدة (`cart_merge_guest`) يجمع
 * الكميات على الفهرس الفريد، فتكراره لا يضاعف شيئًا.
 */
export function GuestCartMerger({ host }: { host: string }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void mergeGuestCart(host).then((res) => {
      if (res.ok && res.data.merged > 0) router.refresh();
    });
  }, [host, router]);

  return null;
}
