'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Copy, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Field';
import { formatMoney } from '@/lib/money/format';
import { placeOrder, quoteCart, type CartLine, type Quote } from '@/lib/cart/actions';
import { beginOrderReceiptUpload } from '@/lib/cart/receipt';
import { ReceiptUploader, type ReceiptValue } from '@/components/shared/ReceiptUploader';

export type Zone = { id: string; name: string; fee: number; minOrderFree: number | null };
export type BankAccount = {
  bank?: string; account?: string; holder?: string; logo?: string;
};
export type PaymentOption = {
  value: 'cash_on_delivery' | 'bank_transfer' | 'bankak';
  label: string; hint: string;
};

/**
 * إتمام الطلب.
 *
 * ★ لا يُحسب مبلغ هنا. كل رقم معروض يأتي من `quote_checkout`، وكل رقم
 * يُحفظ يأتي من `create_order` — نفس المنطق في نفس القاعدة، فلا
 * يختلف ما رآه الزبون عمّا دفعه.
 *
 * ★ مفتاح التكرار (idempotency) يُولَّد مرة واحدة لكل زيارة: ضغطتان
 * على «تأكيد الطلب» أو إعادة إرسال النموذج تعيدان الطلب نفسه لا
 * طلبًا ثانيًا.
 */
export function CheckoutForm({
  host, lines, zones, payments, initialQuote, defaults, idempotencyKey,
  bankAccounts, bankakNumber,
}: {
  host: string;
  lines: CartLine[];
  zones: Zone[];
  payments: PaymentOption[];
  initialQuote: Quote;
  defaults: { name: string; phone: string; email: string };
  /** يُولَّد على الخادم مع الصفحة: ثابت طوال هذه الزيارة. */
  idempotencyKey: string;
  /** حسابات التاجر — تُفتح لمن له سلة في هذا المتجر فقط. */
  bankAccounts: BankAccount[];
  bankakNumber: string | null;
}) {
  const router = useRouter();
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const [payment, setPayment] = useState(payments[0]?.value ?? 'cash_on_delivery');
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptValue | null>(null);
  const [payRef, setPayRef] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [quoting, startQuote] = useTransition();

  // التحويل البنكي وبنكك يشتركان في نفس الدورة: حوّل، ثم أرفق
  const byTransfer = payment === 'bank_transfer' || payment === 'bankak';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* الحافظة محجوبة */ }
  };

  // كل تغيير في المنطقة أو الكوبون ⇒ تسعيرة جديدة من القاعدة
  useEffect(() => {
    let cancelled = false;
    startQuote(async () => {
      const res = await quoteCart({
        host, zoneId: zoneId || null, couponCode: appliedCoupon,
      });
      if (cancelled) return;
      if (res.ok) setQuote(res.data);
      else setError({ message: res.message });
    });
    return () => { cancelled = true; };
  }, [host, zoneId, appliedCoupon]);

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    // ★ الإيصال شرط إتمام الطلب. القاعدة ترفضه بدونه أيضًا (قيد
    // مؤجَّل في 0045) — هذا الفحص لرسالة أوضح لا لحماية أقوى.
    if (byTransfer && !receipt) {
      setError({ message: 'أرفق إيصال التحويل لإتمام الطلب', field: 'proof' });
      return;
    }
    const res = await placeOrder({
      host,
      zoneId: zoneId || null,
      couponCode: appliedCoupon,
      paymentMethod: payment,
      contact: {
        name: String(formData.get('name') ?? ''),
        phone: String(formData.get('phone') ?? ''),
        email: String(formData.get('email') ?? ''),
      },
      address: {
        line: String(formData.get('address') ?? ''),
        landmark: String(formData.get('landmark') ?? ''),
      },
      note: String(formData.get('note') ?? ''),
      idempotencyKey,
      proofMediaId: byTransfer ? receipt?.mediaId ?? null : null,
      paymentReference: byTransfer ? payRef : undefined,
    });

    if (!res.ok) {
      setError({ message: res.message, field: res.field });
      return;
    }
    router.push('/order');
  });

  const fieldError = (name: string) =>
    error?.field === name ? error.message : undefined;
  const short = lines.some((l) => l.quantity > l.available);

  return (
    <form action={submit} className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {error && !error.field && (
          <div role="alert" className="flex items-start gap-2 rounded-md border
                          border-danger/30 bg-danger-bg p-3
                          text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
          </div>
        )}

        <Card>
          <h2 className="border-b border-ink-200 px-5 py-4 font-bold text-ink-900">
            بيانات المستلم
          </h2>
          <div className="space-y-4 p-5">
            <Input name="name" label="الاسم" required defaultValue={defaults.name}
                   autoComplete="name" error={fieldError('name')} />
            <Input name="phone" label="رقم الهاتف" required type="tel" dir="ltr"
                   inputMode="tel" autoComplete="tel" defaultValue={defaults.phone}
                   placeholder="0912345678" hint="سنتواصل معك عليه لتأكيد الطلب."
                   error={fieldError('phone')} />
            <Input name="email" label="البريد الإلكتروني (اختياري)" type="email" dir="ltr"
                   autoComplete="email" defaultValue={defaults.email} />
          </div>
        </Card>

        <Card>
          <h2 className="border-b border-ink-200 px-5 py-4 font-bold text-ink-900">
            التوصيل
          </h2>
          <div className="space-y-4 p-5">
            {zones.length === 0 ? (
              <p className="text-sm text-danger">
                لم يحدّد المتجر مناطق توصيل بعد — تواصل معه لإتمام الطلب.
              </p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[13px] font-bold text-ink-700">
                  منطقة التوصيل
                </legend>
                {zones.map((z) => (
                  <label key={z.id}
                         className={`flex cursor-pointer items-center gap-3 rounded-md
                                     border p-3.5 ${zoneId === z.id
                                       ? 'border-teal-600 bg-teal-50'
                                       : 'border-ink-200 hover:border-teal-300'}`}>
                    <input type="radio" name="zone" value={z.id} checked={zoneId === z.id}
                           onChange={() => setZoneId(z.id)}
                           className="size-4 accent-teal-600" />
                    <span className="flex-1 text-sm font-bold text-ink-900">{z.name}</span>
                    <span className="text-sm font-bold tabular text-ink-700">
                      {formatMoney(z.fee)}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <Input name="address" label="العنوان بالتفصيل" required
                   autoComplete="street-address"
                   placeholder="الحي، الشارع، رقم المنزل"
                   error={fieldError('address')} />
            <Input name="landmark" label="علامة مميزة (اختياري)"
                   placeholder="بجوار مسجد… / أمام صيدلية…" />
            <Textarea name="note" label="ملاحظة للمتجر (اختياري)" />
          </div>
        </Card>

        <Card>
          <h2 className="border-b border-ink-200 px-5 py-4 font-bold text-ink-900">
            طريقة الدفع
          </h2>
          <div className="space-y-2 p-5">
            {payments.map((p) => (
              <label key={p.value}
                     className={`flex cursor-pointer items-start gap-3 rounded-md
                                 border p-3.5 ${payment === p.value
                                   ? 'border-teal-600 bg-teal-50'
                                   : 'border-ink-200 hover:border-teal-300'}`}>
                <input type="radio" name="payment" value={p.value}
                       checked={payment === p.value}
                       onChange={() => setPayment(p.value)}
                       className="mt-0.5 size-4 accent-teal-600" />
                <span>
                  <span className="block text-sm font-bold text-ink-900">{p.label}</span>
                  <span className="block text-xs text-ink-500">{p.hint}</span>
                </span>
              </label>
            ))}

            {byTransfer && (
              <div className="space-y-4 rounded-md border border-teal-600
                              bg-teal-50 p-4">
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                    <Landmark size={14} /> حوّل المبلغ إلى حساب المتجر
                  </p>
                  {payment === 'bankak' && bankakNumber && (
                    <AccountRow bank="بنكك" account={bankakNumber}
                                onCopy={() => copy(bankakNumber)}
                                copied={copied === bankakNumber} />
                  )}
                  {payment === 'bank_transfer' && bankAccounts.map((a, i) => (
                    <AccountRow key={`${a.account}-${i}`} bank={a.bank ?? 'بنك'}
                                account={a.account ?? ''} holder={a.holder}
                                logo={a.logo}
                                onCopy={() => copy(a.account ?? '')}
                                copied={copied === a.account} />
                  ))}
                  {((payment === 'bank_transfer' && bankAccounts.length === 0)
                    || (payment === 'bankak' && !bankakNumber)) && (
                    <p className="text-xs text-danger">
                      لم ينشر المتجر بيانات حسابه بعد — تواصل معه قبل التحويل.
                    </p>
                  )}
                  <p className="text-sm font-bold text-ink-900">
                    المبلغ المطلوب:{' '}
                    <span className="tabular text-teal-700">
                      {formatMoney(quote.total)}
                    </span>
                  </p>
                </div>

                <Input label="رقم العملية أو اسم المحوِّل (اختياري)" dir="ltr"
                       value={payRef} onChange={(e) => setPayRef(e.target.value)}
                       hint="يساعد المتجر على مطابقة تحويلك بسرعة." />

                <ReceiptUploader
                  label="إيصال التحويل"
                  hint="صورة واضحة للإشعار أو ملف PDF. لا يراه إلا المتجر."
                  value={receipt} onChange={setReceipt} disabled={pending}
                  begin={({ mime, size }) =>
                    beginOrderReceiptUpload({ host, mime, size })}
                />
                {error?.field === 'proof' && (
                  <p role="alert" className="text-xs text-danger">{error.message}</p>
                )}

                <p className="text-xs text-ink-600">
                  إرفاق الإيصال لا يؤكّد الدفع: يصل طلبك إلى المتجر
                  «بانتظار التحقق»، ويؤكّده المتجر بعد وصول المبلغ.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="h-fit p-4 lg:sticky lg:top-20">
        <h2 className="font-bold text-ink-900">ملخص الطلب</h2>

        <ul className="mt-3 space-y-2 border-b border-ink-200 pb-3 text-sm">
          {lines.map((l) => (
            <li key={l.itemId} className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-ink-600">
                {l.productName}
                <span className="text-ink-500"> × <span className="tabular">{l.quantity}</span></span>
              </span>
              <span className="font-bold tabular text-ink-900">{formatMoney(l.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-end gap-2">
          <Input label="كود الخصم" value={coupon} dir="ltr" className="flex-1"
                 onChange={(e) => setCoupon(e.target.value)}
                 error={quote.couponMessage && !quote.couponValid && appliedCoupon
                   ? quote.couponMessage : undefined} />
          <Button type="button" variant="outline" disabled={quoting || !coupon.trim()}
                  onClick={() => setAppliedCoupon(coupon.trim() || null)}>
            تطبيق
          </Button>
        </div>
        {appliedCoupon && quote.couponValid && (
          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-success">
            <Check size={12} /> {quote.couponMessage}
          </p>
        )}

        <dl className="mt-4 space-y-2 text-sm">
          <Line label="المجموع" value={formatMoney(quote.subtotal)} />
          <Line label="التوصيل" value={formatMoney(quote.deliveryFee)} />
          {quote.discountTotal > 0 && (
            <Line label="الخصم" value={`− ${formatMoney(quote.discountTotal)}`} good />
          )}
        </dl>

        <p className="mt-3 flex items-baseline justify-between border-t border-ink-200 pt-3">
          <span className="font-bold text-ink-900">الإجمالي</span>
          <span className="text-xl font-extrabold tabular text-teal-700">
            {quoting ? <Loader2 size={18} className="animate-spin" /> : formatMoney(quote.total)}
          </span>
        </p>

        <Button type="submit" size="lg" className="mt-4 w-full" loading={pending}
                disabled={quoting || short || !quote.canCheckout
                          || lines.length === 0 || zones.length === 0
                          || (byTransfer && !receipt)}>
          تأكيد الطلب
        </Button>
        {byTransfer && !receipt && (
          <p className="mt-2 text-center text-xs text-ink-500">
            أرفق إيصال التحويل أولًا.
          </p>
        )}

        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck size={13} /> كل المبالغ محسوبة لدى المتجر
        </p>
      </Card>
    </form>
  );
}

function AccountRow({ bank, account, holder, logo, onCopy, copied }: {
  bank: string; account: string; holder?: string; logo?: string;
  onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {logo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={logo} alt="" width={28} height={28}
             className="size-7 rounded border border-ink-200 bg-white object-contain p-0.5" />
      )}
      <span className="font-bold text-ink-900">{bank}</span>
      {holder && <span className="text-xs text-ink-500">{holder}</span>}
      <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs
                       text-ink-900" dir="ltr">{account}</code>
      <button type="button" onClick={onCopy} aria-label={`نسخ رقم ${bank}`}
              className="rounded p-1.5 text-ink-500 hover:text-teal-700">
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function Line({ label, value, good = false }: {
  label: string; value: string; good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`font-bold tabular ${good ? 'text-success' : 'text-ink-900'}`}>
        {value}
      </dd>
    </div>
  );
}
