'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { addToCart } from '@/lib/cart/actions';

/**
 * زر الإضافة إلى السلة.
 * لا يحسب سعرًا ولا يعرض إجماليًا — المبالغ كلها من صفحة السلة بعد
 * قراءتها من القاعدة (D10).
 */
export function AddToCartButton({ host, productId, variantId, available, disabled, disabledNote }: {
  host: string;
  productId: string;
  variantId?: string | null;
  available: number;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();

  const max = Math.max(1, Math.min(available, 999));
  const soldOut = available <= 0;

  const submit = () => start(async () => {
    setError(null);
    setAdded(false);
    const res = await addToCart({ host, productId, quantity, variantId });
    if (!res.ok) { setError(res.message); return; }
    setAdded(true);
    router.refresh();
  });

  if (disabled) {
    return (
      <p className="rounded-[--radius-md] border border-sand-300 bg-sand-100 p-3.5
                    text-center text-sm font-bold text-sand-700">
        {disabledNote ?? 'الشراء غير متاح حاليًا'}
      </p>
    );
  }

  if (soldOut) {
    return (
      <p className="rounded-[--radius-md] border border-sand-300 bg-sand-100 p-3.5
                    text-center text-sm font-bold text-sand-700">
        نفدت الكمية
      </p>
    );
  }

  const step = 'flex size-11 items-center justify-center rounded-[--radius-md] ' +
               'border border-sand-300 text-navy-700 disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className={step} aria-label="إنقاص الكمية"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}>
          <Minus size={16} />
        </button>
        <span className="min-w-12 text-center text-lg font-bold tabular text-navy-900"
              aria-live="polite">{quantity}</span>
        <button type="button" className={step} aria-label="زيادة الكمية"
                disabled={quantity >= max}
                onClick={() => setQuantity(quantity + 1)}>
          <Plus size={16} />
        </button>
        {available <= 5 && (
          <span className="ms-2 text-xs font-bold text-gold-600">
            بقي <span className="tabular">{available}</span> فقط
          </span>
        )}
      </div>

      <Button size="lg" className="w-full" loading={pending} onClick={submit}
              icon={added ? <Check size={18} /> : <ShoppingBag size={18} />}>
        {added ? 'أُضيف إلى السلة' : 'أضف إلى السلة'}
      </Button>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
