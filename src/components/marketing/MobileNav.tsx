'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

/**
 * قائمة التنقّل على الشاشات الضيّقة.
 *
 * ★ لوحة المفاتيح أولًا: Escape يغلق، والتركيز يعود إلى الزرّ الذي
 * فتح القائمة لا إلى أعلى الصفحة — وإلا ضاع مكان المستخدم. وتُقفل
 * تمرير الصفحة خلفها حتى لا تتحرّك الخلفية تحت الإصبع.
 */
export function MobileNav({ items, signedIn, appHref, appLabel }: {
  items: { href: string; label: string }[];
  signedIn: boolean; appHref: string; appLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
        className="grid size-10 place-items-center rounded-md border border-ink-200
                   text-ink-700 transition-colors hover:border-ink-300 lg:hidden"
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 lg:hidden">
          <button type="button" aria-label="إغلاق القائمة"
                  onClick={() => { setOpen(false); trigger.current?.focus(); }}
                  className="absolute inset-0 bg-ink-900/30" />
          <div ref={panel} id="mobile-nav"
               className="reveal absolute inset-x-0 top-0 border-b border-ink-200 bg-white p-4">
            <ul className="divide-y divide-ink-100">
              {items.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setOpen(false)}
                        className="block py-3.5 text-[15px] font-medium text-ink-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2">
              {signedIn ? (
                <Link href={appHref} onClick={() => setOpen(false)}
                      className="inline-flex h-11 items-center justify-center rounded-md
                                 bg-teal-600 font-semibold text-white">
                  {appLabel}
                </Link>
              ) : (
                <>
                  <Link href="/signup" onClick={() => setOpen(false)}
                        className="inline-flex h-11 items-center justify-center rounded-md
                                   bg-teal-600 font-semibold text-white">
                    أنشئ متجرك
                  </Link>
                  <Link href="/login" onClick={() => setOpen(false)}
                        className="inline-flex h-11 items-center justify-center rounded-md
                                   border border-ink-200 font-semibold text-ink-900">
                    تسجيل الدخول
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
