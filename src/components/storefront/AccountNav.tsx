'use client';
import Link from 'next/link';
import { Heart, User } from 'lucide-react';
import { useViewer } from './ViewerProvider';

/**
 * أيقونات الحساب في ترويسة المتجر.
 *
 * ★ كان التخطيط ينادي `getActor()` ليعرف أيّ أيقونة يرسم — وهي
 * قراءة كوكيز وست استعلامات، وكانت وحدها كافية لمنع تخزين كل
 * صفحات المتجر.
 *
 * ★ الحالة الابتدائية هي حالة الزائر غير المسجَّل: وهي الصحيحة
 * للـHTML المخزَّن، لأنّه HTML واحد يُخدَم للجميع. والمسجَّل ترتفع
 * أيقونتاه بعد جلبة `/viewer` القصيرة.
 */
export function AccountNav() {
  const { signedIn } = useViewer();
  const cls = 'hidden size-11 place-items-center rounded-md text-ink-700'
    + ' transition-colors hover:bg-ink-100 sm:grid';

  if (!signedIn) {
    return (
      <Link href="/login" aria-label="تسجيل الدخول" className={cls}>
        <User size={20} aria-hidden />
      </Link>
    );
  }

  return (
    <>
      <Link href="/wishlist" aria-label="المفضّلة" className={cls}>
        <Heart size={20} aria-hidden />
      </Link>
      <Link href="/account" aria-label="حسابي" className={cls}>
        <User size={20} aria-hidden />
      </Link>
    </>
  );
}
