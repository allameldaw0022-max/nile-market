'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui/Button';
import { AccountMenu } from '@/components/shared/AccountMenu';
import { MobileNav } from '@/components/marketing/MobileNav';
import type { MePayload } from '@/app/api/v1/me/route';

/**
 * ركن الحساب في شريط القسم التعريفيّ.
 *
 * ★★★ هذا المكوّن هو ما يجعل القسم كلّه قابلًا للتخزين على الحافّة.
 * كان التخطيط ينادي `getActor()` ليعرف إن كان الزائر مسجَّلًا، وقراءة
 * الكوكيز في التخطيط تُحوّل سبع عشرة صفحة تعريفية إلى تصيير لكل طلب.
 * فصار الشخصيّ يُجلب بعد الإماهة من `/api/v1/me`، والقشرة تُخدَم من
 * الحافّة لكل الزوّار.
 *
 * ★★ والحالة الابتدائية هي حالة **الزائر** لا حالة فراغ: أزرار الدخول
 * والتسجيل تُرسم فورًا في HTML المخزَّن. فالزائر الجديد — وهو الأغلبية
 * الساحقة على صفحةٍ تعريفية — يرى الشريط الصحيح من أول إطار بلا أي
 * ارتجاف. والمسجَّل وحده يرى تبديلًا بعد جزءٍ من الثانية.
 *
 * ★ ولا يُحجز مكانٌ فارغ للزرّ: عرض «تسجيل الدخول» قريب من عرض «لوحة
 *   التحكم»، والتبديل لا يُزيح المحتوى تحته لأن الشريط ثابت الارتفاع.
 */
export function HeaderAccount({ items }: { items: { href: string; label: string }[] }) {
  const [me, setMe] = useState<MePayload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MePayload | null) => { if (alive && d) setMe(d); })
      // فشل الجلب يُبقي حالة الزائر — وهي الحالة الآمنة.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const signedIn = me?.signedIn ?? false;
  const hasStore = me?.hasStore ?? false;
  const appHref = hasStore ? '/dashboard' : '/onboarding';
  const appLabel = hasStore ? 'لوحة التحكم' : 'أنشئ متجرك';
  const partnerLink = me?.isPartner ? [{ href: '/partner', label: 'لوحة الشريك' }] : [];

  return (
    <div className="ms-auto flex items-center gap-2">
      {signedIn ? (
        <>
          <Link href={appHref} className={buttonClass('primary', 'sm')}>{appLabel}</Link>
          {/* ★ مخرج في القسم العام أيضًا: من سجّل ووقف هنا كان
              يرى زرّ لوحة فقط، بلا طريقة للخروج من الحساب. */}
          <span className="hidden sm:block">
            <AccountMenu email={me?.email ?? null}
                         isPlatformStaff={Boolean(me?.isPlatformStaff)}
                         links={partnerLink} />
          </span>
        </>
      ) : (
        <>
          <Link href="/login"
                className="hidden px-2 text-[14px] font-medium text-ink-600
                           transition-colors hover:text-ink-900 sm:block">
            تسجيل الدخول
          </Link>
          <Link href="/signup" className={buttonClass('primary', 'sm')}>أنشئ متجرك</Link>
        </>
      )}
      <MobileNav items={items} signedIn={signedIn} appHref={appHref}
                 appLabel={appLabel} extra={partnerLink} />
    </div>
  );
}
