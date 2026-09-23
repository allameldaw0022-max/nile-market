'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { signOut } from '@/app/(platform)/(auth)/actions';

/**
 * قائمة الحساب في لوحة التاجر.
 *
 * ★★ سبب وجودها: لم يكن في اللوحة أي مخرج. `signOut()` كانت مكتوبة في
 * الكود و**غير مستعملة في أي مكوّن**، فالتاجر يدخل ولا يستطيع الخروج
 * إلا بمسح كوكيز المتصفّح أو بـ«الخروج من كل الأجهزة» — وهذا يُنهي
 * جلساته على هاتفه وحاسوبه معًا، وهو ليس ما يريده من أراد الخروج من
 * جهاز واحد.
 *
 * ★ نفس آليّة `StoreMenu` في الإغلاق: نقرة خارج القائمة أو Escape.
 * تكرار السلوك مقصود — قائمتان متجاورتان تتصرّفان تصرّفًا واحدًا.
 */
export function AccountMenu({ email, isPlatformStaff }: {
  email: string | null; isPlatformStaff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 px-4 py-3 text-start text-[14px] hover:bg-ink-50';

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-haspopup="menu" aria-label="حسابك"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border
                         border-ink-200 px-3 text-[13px] font-medium text-ink-700
                         transition-colors hover:border-ink-300">
        <UserRound size={15} aria-hidden />
        <span className="hidden sm:inline">حسابك</span>
        <ChevronDown size={14} aria-hidden className={open ? 'rotate-180' : ''} />
      </button>

      {open && (
        <div role="menu"
             className="absolute end-0 top-12 z-50 w-72 overflow-hidden rounded-lg
                        border border-ink-200 bg-white shadow-popover">
          {email && (
            <p className="border-b border-ink-100 px-4 py-2.5 text-[12px] text-ink-500">
              <span dir="ltr" className="block truncate font-medium text-ink-900">{email}</span>
            </p>
          )}

          <Link role="menuitem" href="/account/security" onClick={() => setOpen(false)}
                className={`${item} text-ink-900`}>
            <ShieldCheck size={15} className="text-ink-400" aria-hidden />
            مركز الأمان
          </Link>

          {isPlatformStaff && (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)}
                  className={`${item} border-t border-ink-100 text-ink-900`}>
              <ShieldCheck size={15} className="text-gold-700" aria-hidden />
              لوحة إدارة المنصّة
            </Link>
          )}

          <form action={signOut} className="border-t border-ink-100">
            <button role="menuitem" type="submit" className={`${item} text-danger`}>
              <LogOut size={15} aria-hidden className="flip-rtl" />
              تسجيل الخروج
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
