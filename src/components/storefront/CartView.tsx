'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ImageOff, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { formatMoney } from '@/lib/money/format';
import { setCartQuantity, type CartLine, type Quote } from '@/lib/cart/actions';
import { publishCartCount } from './cartEvent';

/**
 * السلة. كل مبلغ معروض هنا جاء محسوبًا من القاعدة — لا ضرب ولا جمع
 * في المتصفح (D10)، حتى لا يختلف ما يراه الزبون عمّا يُحفظ في الطلب.
 */
export function CartView({ host, lines, quote, canCheckout }: {
  host: string;
  lines: CartLine[];
  quote: Quote | null;
  canCheckout: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (itemId: string, quantity: number) => start(async () => {
    setError(null);
    const res = await setCartQuantity({ host, itemId, quantity });
    if (!res.ok) { setError(res.message); return; }
    // ★ هنا `refresh` مشروع: الصفحة المعروضة **هي** السلة، فالأسعار
    // والإجماليات وحالة المخزون كلّها تتغيّر. الشارة تُحدَّث فورًا
    // بالعدد العائد فلا تنتظر دورة الخادم.
    publishCartCount(res.data.cartCount);
    router.refresh();
  });

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag size={36} strokeWidth={1.5} />}
        title="سلتك فارغة"
        description="تصفّح المنتجات وأضف ما يعجبك."
        action={<Link href="/products"><Button>تصفّح المنتجات</Button></Link>}
      />
    );
  }

  const short = lines.some((l) => l.quantity > l.available);
  const step = 'flex size-9 items-center justify-center rounded-md ' +
               'border border-ink-300 text-ink-700 disabled:opacity-40';

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border
                          border-danger/30 bg-danger-bg p-3
                          text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {lines.map((line) => {
          const over = line.quantity > line.available;
          return (
            <Card key={line.itemId} className="flex gap-3 p-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-md
                              border border-ink-200 bg-ink-100">
                {line.imageUrl ? (
                  <Image src={line.imageUrl} alt="" fill sizes="80px" className="object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-ink-400">
                    <ImageOff size={20} />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link href={`/products/${line.productSlug}`}
                      className="line-clamp-2 font-bold text-ink-900 hover:text-teal-700">
                  {line.productName}
                </Link>
                {line.variantName && (
                  <p className="text-xs text-ink-500">{line.variantName}</p>
                )}
                <p className="mt-0.5 text-sm text-ink-500 tabular">
                  {formatMoney(line.unitPrice)} للقطعة
                </p>

                {over && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-danger">
                    <AlertTriangle size={12} />
                    المتوفّر <span className="tabular">{line.available}</span> فقط
                  </p>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className={step} aria-label="إنقاص الكمية"
                          disabled={pending}
                          onClick={() => change(line.itemId, line.quantity - 1)}>
                    {line.quantity <= 1 ? <Trash2 size={14} /> : <Minus size={15} />}
                  </button>
                  <span className="min-w-8 text-center font-bold tabular text-ink-900">
                    {line.quantity}
                  </span>
                  <button type="button" className={step} aria-label="زيادة الكمية"
                          disabled={pending || line.quantity >= line.available}
                          onClick={() => change(line.itemId, line.quantity + 1)}>
                    <Plus size={15} />
                  </button>

                  <button type="button" aria-label={`حذف ${line.productName}`}
                          disabled={pending}
                          onClick={() => change(line.itemId, 0)}
                          className="ms-auto rounded p-2 text-danger
                                     hover:bg-danger-bg disabled:opacity-40">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <p className="self-end font-extrabold tabular text-ink-900">
                {formatMoney(line.lineTotal)}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="h-fit p-4 lg:sticky lg:top-20">
        <h2 className="font-bold text-ink-900">ملخص الطلب</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="المجموع" value={formatMoney(quote?.subtotal ?? 0)} />
          <Row label="التوصيل" value="يُحتسب في الخطوة التالية" muted />
        </dl>
        <p className="mt-4 flex items-baseline justify-between border-t border-ink-200 pt-3">
          <span className="font-bold text-ink-900">الإجمالي المبدئي</span>
          <span className="text-lg font-extrabold tabular text-teal-700">
            {formatMoney(quote?.subtotal ?? 0)}
          </span>
        </p>

        {!canCheckout ? (
          <p className="mt-4 rounded-md border border-ink-300 bg-ink-100 p-3
                        text-center text-sm font-bold text-ink-600">
            الشراء غير متاح من هذا المتجر حاليًا
          </p>
        ) : short ? (
          <p className="mt-4 rounded-md border border-danger/30
                        bg-danger-bg p-3 text-center text-sm
                        font-bold text-danger">
            عدّل الكميات غير المتوفرة للمتابعة
          </p>
        ) : (
          <Link href="/checkout" className="mt-4 block">
            <Button size="lg" className="w-full">متابعة الطلب</Button>
          </Link>
        )}

        <Link href="/products"
              className="mt-3 block text-center text-sm font-bold text-teal-700 hover:underline">
          مواصلة التسوّق
        </Link>
      </Card>
    </div>
  );
}

function Row({ label, value, muted = false }: {
  label: string; value: string; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={muted ? 'text-xs text-ink-500' : 'font-bold tabular text-ink-900'}>
        {value}
      </dd>
    </div>
  );
}
