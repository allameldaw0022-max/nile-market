'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isActive, type NavGroup } from '@/lib/dashboard-nav';

/**
 * تنقّل اللوحة.
 *
 * ★ عمود جانبي على الشاشات الواسعة بدل شريط تبويبات أفقي يُمرَّر:
 * الشريط الأفقي بأربعة عشر قسمًا يُخفي أغلبها خلف تمرير لا يراه
 * المستخدم، والأقسام المجمَّعة تُقرأ دفعة واحدة فيعرف التاجر أين هو
 * وأين بقيّة الأدوات.
 *
 * ★ `aria-current="page"` لا اللون وحده: قارئ الشاشة يحتاج أن يُخبَر
 * بالقسم المفتوح، والحدّ الجانبي علامة ثانية لمن لا يميّز اللون.
 */
export function SideNav({ groups, onNavigate }: {
  groups: NavGroup[]; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="أقسام اللوحة" className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {g.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {g.links.map((l) => {
              const active = isActive(pathname, l);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center rounded-[--radius-sm] px-3 py-2 text-[14px] transition-colors',
                      active
                        ? 'border-e-2 border-teal-600 bg-teal-50 font-semibold text-teal-700'
                        : 'font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** الدرج على الهاتف — نفس الأقسام، بلا تكرار لمنطق التنقّل. */
export function NavDrawer({ groups, storeName }: { groups: NavGroup[]; storeName: string }) {
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
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}
              aria-expanded={open} aria-controls="dash-drawer" aria-label="فتح أقسام اللوحة"
              className="grid size-10 place-items-center rounded-[--radius-md] border border-ink-200
                         text-ink-700 transition-colors hover:border-ink-300 lg:hidden">
        <Menu size={18} aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="إغلاق"
                  onClick={() => { setOpen(false); trigger.current?.focus(); }}
                  className="absolute inset-0 bg-ink-900/40" />
          <div id="dash-drawer"
               className="absolute inset-y-0 end-0 flex w-[82%] max-w-xs flex-col
                          border-s border-ink-200 bg-white">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
              <p className="truncate text-[15px] font-bold text-ink-900">{storeName}</p>
              <button type="button" aria-label="إغلاق"
                      onClick={() => { setOpen(false); trigger.current?.focus(); }}
                      className="grid size-9 place-items-center rounded-[--radius-sm] text-ink-500
                                 hover:bg-ink-100">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SideNav groups={groups} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
