'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

export type NavCategory = { id: string; name: string; slug: string };

/**
 * درج التنقّل على الهاتف.
 *
 * ★ التصنيفات داخل الدرج لا في شريط أفقي يُمرَّر: شريط التمرير يُخفي
 * أغلب التصنيفات خلف حركة لا يراها الزائر، والدرج يعرضها قائمةً
 * تُقرأ دفعة واحدة.
 *
 * ★ يُغلق بالمفتاح Escape وبالنقر خارجه، ويُعيد التركيز إلى الزرّ:
 * من فتحه بلوحة المفاتيح يجب أن يعود إلى حيث كان.
 */
export function StoreMobileNav({ storeName, categories }: {
  storeName: string; categories: NavCategory[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };

  const link = 'flex h-12 items-center rounded-md px-3 text-[15px] font-medium '
    + 'text-ink-800 transition-colors hover:bg-ink-50';

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}
              aria-expanded={open} aria-controls="store-drawer" aria-label="القائمة"
              className="grid size-11 shrink-0 place-items-center rounded-md
                         text-ink-700 transition-colors hover:bg-ink-100 lg:hidden">
        <Menu size={21} aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="إغلاق" onClick={close}
                  className="absolute inset-0 bg-ink-900/45" />
          <div id="store-drawer"
               className="absolute inset-y-0 start-0 flex w-[84%] max-w-xs flex-col bg-white">
            <div className="flex h-16 items-center justify-between border-b border-ink-200 px-4">
              <p className="truncate text-[16px] font-bold text-ink-900">{storeName}</p>
              <button type="button" aria-label="إغلاق" onClick={close}
                      className="grid size-10 place-items-center rounded-md
                                 text-ink-500 hover:bg-ink-100">
                <X size={19} aria-hidden />
              </button>
            </div>

            <nav aria-label="تنقّل المتجر" className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-0.5">
                <li><Link href="/" onClick={close} className={link}>الرئيسية</Link></li>
                <li><Link href="/products" onClick={close} className={link}>كل المنتجات</Link></li>
                <li><Link href="/wishlist" onClick={close} className={link}>المفضّلة</Link></li>
                <li><Link href="/orders/track" onClick={close} className={link}>تتبّع طلبك</Link></li>
                <li><Link href="/contact" onClick={close} className={link}>تواصل معنا</Link></li>
              </ul>

              {categories.length > 0 && (
                <>
                  <p className="mt-5 px-3 text-[11px] font-semibold uppercase
                                tracking-wider text-ink-400">
                    التصنيفات
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {categories.map((c) => (
                      <li key={c.id}>
                        <Link href={`/categories/${c.slug}`} onClick={close} className={link}>
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
