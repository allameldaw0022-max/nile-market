'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

type Scope = { key: string; label: string; path: string; hint: string };

/**
 * البحث العامّ في اللوحة.
 *
 * ★ ليس زرًّا شكليًا: يُرسل النصّ إلى صفحة القسم الحقيقية عبر نفس
 * معامل `q` الذي تقرأه تلك الصفحة أصلًا، فيصل المستخدم إلى نتيجة
 * فعلية لا إلى نافذة فارغة. ولا يُنشأ له مسار بحث موازٍ في الخادم —
 * البحث الموجود هو البحث.
 *
 * ★ النطاق يُختار قبل الكتابة لأن «١٠٤٧» قد يكون رقم طلب أو اسم
 * منتج، والتخمين نيابة عن التاجر يرسله إلى القسم الخطأ.
 */
const SCOPES: Scope[] = [
  { key: 'orders',    label: 'الطلبات',  path: '/dashboard/orders',    hint: 'رقم الطلب أو هاتف العميل' },
  { key: 'products',  label: 'المنتجات', path: '/dashboard/products',  hint: 'اسم المنتج أو SKU' },
  { key: 'customers', label: 'العملاء',  path: '/dashboard/customers', hint: 'اسم العميل أو هاتفه' },
];

export function GlobalSearch({ allowed }: { allowed: string[] }) {
  const scopes = SCOPES.filter((s) => allowed.includes(s.key));
  const [scope, setScope] = useState(scopes[0]?.key ?? '');
  const [term, setTerm] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // اختصار «/» للتركيز — عادة راسخة في أدوات الويب، وبلا تعارض مع الكتابة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        || (el as HTMLElement | null)?.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (scopes.length === 0) return null;
  const current = scopes.find((s) => s.key === scope) ?? scopes[0];

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = term.trim();
        router.push(q ? `${current.path}?q=${encodeURIComponent(q)}` : current.path);
      }}
      className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex"
    >
      <label htmlFor="global-search" className="sr-only">ابحث في {current.label}</label>

      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[--radius-md]
                      border border-ink-200 bg-white ps-3 focus-within:border-teal-600">
        <Search size={15} className="shrink-0 text-ink-400" aria-hidden />
        <input
          ref={input}
          id="global-search"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={current.hint}
          maxLength={80}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink-900
                     outline-none placeholder:text-ink-400"
        />
        {scopes.length > 1 && (
          <>
            <label htmlFor="global-scope" className="sr-only">نطاق البحث</label>
            <select
              id="global-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-full shrink-0 rounded-e-[--radius-md] border-s border-ink-200
                         bg-ink-50 px-2 text-[13px] font-medium text-ink-600 outline-none"
            >
              {scopes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </>
        )}
      </div>
    </form>
  );
}
