'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus } from 'lucide-react';
import { addToCart } from '@/lib/cart/actions';

/**
 * إضافة سريعة من بطاقة المنتج.
 *
 * ★ زرّ حقيقي يستدعي نفس `addToCart` الذي تستدعيه صفحة المنتج — لا
 * مسار موازٍ ولا حساب سعر في المتصفّح (D10: المبالغ من القاعدة).
 *
 * ★ لا يظهر لمنتج بخيارات: «أضف» لقميص بأربعة مقاسات يعني اختيارًا
 * نيابةً عن العميل. في تلك الحالة تقود البطاقة إلى صفحة المنتج.
 *
 * ★ `stopPropagation` لأن البطاقة كلها رابط: بدونه تُضاف القطعة
 * ويُنتقل إلى الصفحة في آن واحد.
 */
export function QuickAdd({ host, productId, label }: {
  host: string; productId: string; label: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-label={state === 'done' ? `أُضيف ${label} إلى السلة` : `أضف ${label} إلى السلة`}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const res = await addToCart({ host, productId, quantity: 1 });
          if (!res.ok) { setState('error'); return; }
          setState('done');
          router.refresh();
          setTimeout(() => setState('idle'), 2200);
        });
      }}
      className={`grid size-9 shrink-0 place-items-center rounded-sm border
                  transition-colors disabled:opacity-60
                  ${state === 'done'
                    ? 'border-success bg-success-bg text-success'
                    : state === 'error'
                      ? 'border-danger bg-danger-bg text-danger'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-teal-600 hover:text-teal-700'}`}
    >
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden />
        : state === 'done' ? <Check size={16} aria-hidden />
        : <Plus size={16} aria-hidden />}
    </button>
  );
}
