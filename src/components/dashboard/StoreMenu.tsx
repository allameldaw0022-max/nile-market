'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, Share2 } from 'lucide-react';

/**
 * قائمة المتجر: فتحه ومشاركة رابطه.
 *
 * ★ المشاركة تستعمل `navigator.share` حيث يوجد (الهاتف غالبًا) وتسقط
 * إلى نسخ الرابط حيث لا يوجد — لا يُعرض زرّ مشاركة لا يفعل شيئًا على
 * سطح المكتب.
 *
 * ★ لا يُعرض شيء أصلًا إن لم يكن للمتجر نطاق بعد: قائمة «شارك متجرك»
 * بلا رابط تعد بما لا تملك.
 */
export function StoreMenu({ hostname, storeName }: { hostname: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const url = `https://${hostname}`;

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* المتصفّح منع الحافظة — الرابط ظاهر للنسخ يدويًا */ }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ title: storeName, url }); return; } catch { /* أُلغيت */ }
    }
    void copy();
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-haspopup="menu"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border
                         border-ink-200 px-3 text-[13px] font-medium text-ink-700
                         transition-colors hover:border-ink-300">
        <ExternalLink size={15} aria-hidden />
        <span className="hidden sm:inline">متجرك</span>
        <ChevronDown size={14} aria-hidden className={open ? 'rotate-180' : ''} />
      </button>

      {open && (
        <div role="menu"
             className="absolute end-0 top-12 z-50 w-72 overflow-hidden rounded-lg
                        border border-ink-200 bg-white shadow-popover">
          <p className="border-b border-ink-100 px-4 py-2.5 text-[12px] text-ink-500">
            <span dir="ltr" className="block truncate font-medium text-ink-900">{hostname}</span>
          </p>
          <a role="menuitem" href={url} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-2.5 px-4 py-3 text-[14px] text-ink-900 hover:bg-ink-50">
            <ExternalLink size={15} className="text-ink-400" aria-hidden />فتح المتجر
          </a>
          <button role="menuitem" type="button" onClick={copy}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-start text-[14px]
                             text-ink-900 hover:bg-ink-50">
            {copied
              ? <><Check size={15} className="text-success" aria-hidden />نُسخ الرابط</>
              : <><Copy size={15} className="text-ink-400" aria-hidden />نسخ الرابط</>}
          </button>
          <button role="menuitem" type="button" onClick={share}
                  className="flex w-full items-center gap-2.5 border-t border-ink-100 px-4 py-3
                             text-start text-[14px] text-ink-900 hover:bg-ink-50">
            <Share2 size={15} className="text-ink-400" aria-hidden />مشاركة المتجر
          </button>
        </div>
      )}
    </div>
  );
}
