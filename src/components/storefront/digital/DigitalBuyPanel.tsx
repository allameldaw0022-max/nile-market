'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronLeft, Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/money/format';
import { beginOrderReceiptUpload } from '@/lib/cart/receipt';
import { ReceiptUploader, type ReceiptValue } from '@/components/shared/ReceiptUploader';
import { placeDigitalOrder, setDigitalCartLine } from '@/lib/digital/actions';

export type DigitalPackage = {
  id: string; name: string; price: number | null; sortOrder: number;
};
export type DigitalField = { id: string; label: string; hint: string | null };

type Step = 'package' | 'details' | 'review' | 'pay';

/**
 * لوح الشراء الرقمي.
 *
 * ★★ خمس خطوات بمسار واحد: باقة ⟶ بيانات الشحن ⟶ مراجعة ⟶ دفع.
 * ولا سعر يُرسَل من هنا إطلاقًا: ما يُرسَل معرّف الباقة، والقاعدة
 * تقرأ سعرها وتحسب الإجمالي. وما يظهر هنا للعرض وحده.
 *
 * ★★ ومراجعةٌ قبل الدفع ليست تزيينًا: بيانات الشحن الرقمية لا تُصحَّح
 * بعد التنفيذ — رقم لاعبٍ خاطئ يعني شحنًا لحساب غريب. فالعميل يرى
 * كل ما أدخله ويؤكّده قبل أن يدفع.
 *
 * ★ والمتجر غير المؤهَّل لاستقبال الطلبات: اللوح يعرض الرسالة
 * المحيَّدة ولا يعرض النموذج. والحاجز الحقيقي في القاعدة — لو استُدعي
 * الفعل مباشرةً لرُفض الطلب.
 */
export function DigitalBuyPanel({
  host, productId, productName, basePrice, packages, fields,
  canCheckout, methods,
}: {
  host: string; productId: string; productName: string;
  basePrice: number;
  packages: DigitalPackage[];
  fields: DigitalField[];
  canCheckout: boolean;
  methods: { bankTransfer: boolean; bankak: boolean };
}) {
  const router = useRouter();
  const sorted = useMemo(
    () => [...packages].sort((a, b) => a.sortOrder - b.sortOrder), [packages]);

  const [step, setStep] = useState<Step>(sorted.length > 0 ? 'package' : 'details');
  const [picked, setPicked] = useState<string | null>(
    sorted.length === 1 ? sorted[0].id : null);
  const [qty, setQty] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [method, setMethod] = useState<'bank_transfer' | 'bankak'>(
    methods.bankTransfer ? 'bank_transfer' : 'bankak');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<ReceiptValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idemKey] = useState(
    () => `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  const pack = sorted.find((p) => p.id === picked) ?? null;
  const unit = pack?.price != null ? Number(pack.price) : basePrice;
  const total = unit * qty;
  const anyMethod = methods.bankTransfer || methods.bankak;

  if (!canCheckout) {
    return (
      <div className="rounded-lg p-4" role="status"
           style={{ background: 'var(--d-surface)',
                    border: '1px solid var(--d-border)' }}>
        <p className="flex items-center gap-2 text-[14px] font-bold">
          <AlertTriangle size={16} aria-hidden style={{ color: 'var(--d-gold)' }} />
          غير متاح لاستقبال الطلبات حاليًا
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed"
           style={{ color: 'var(--d-text-2)' }}>
          يمكنك تصفّح المنتجات والباقات، والتواصل مع المتجر لمعرفة موعد
          استئناف الطلبات.
        </p>
      </div>
    );
  }

  if (!anyMethod) {
    return (
      <div className="rounded-lg p-4" role="status"
           style={{ background: 'var(--d-surface)',
                    border: '1px solid var(--d-border)' }}>
        <p className="text-[14px] font-bold">لا طريقة دفع مفعّلة</p>
        <p className="mt-1.5 text-[13px]" style={{ color: 'var(--d-text-2)' }}>
          تواصل مع المتجر لإتمام طلبك.
        </p>
      </div>
    );
  }

  const missing = fields.filter((f) => (values[f.id] ?? '').trim() === '');
  const contactOk = contact.name.trim().length >= 2
    && contact.phone.replace(/\D/g, '').length >= 9;

  const goDetails = () => {
    if (sorted.length > 0 && !picked) { setError('اختر الباقة أولًا'); return; }
    setError(null); setStep('details');
  };

  const goReview = () => {
    if (missing.length > 0) { setError(`أكمل: ${missing[0].label}`); return; }
    if (!contactOk) { setError('الاسم ورقم الهاتف مطلوبان'); return; }
    setError(null); setStep('review');
  };

  const goPay = async () => {
    setBusy(true); setError(null);
    // ★ السلّة تُضبَط على سطرٍ واحد هنا: رفع الإيصال يشترط سلّة غير
    //   فارغة في القاعدة، والإيصال يُربَط بها. فهي جزءٌ من مسار الدفع
    //   القائم لا خطوة زائدة.
    const res = await setDigitalCartLine({
      host, productId, variantId: picked, quantity: qty,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setStep('pay');
  };

  const submit = async () => {
    if (!receipt) { setError('أرفق إيصال التحويل'); return; }
    setBusy(true); setError(null);
    try {
      const placed = await placeDigitalOrder({
        host, productId, variantId: picked, quantity: qty,
        contact: {
          name: contact.name, phone: contact.phone,
          email: contact.email || undefined,
        },
        fields: fields.map((f) => ({ label: f.label, value: values[f.id] ?? '' })),
        paymentMethod: method,
        proofMediaId: receipt.mediaId,
        paymentReference: reference || undefined,
        idempotencyKey: idemKey,
      });
      if (!placed.ok) throw new Error(placed.message);
      router.push(`/order?n=${encodeURIComponent(placed.data.orderNumber)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر إتمام الطلب');
      setBusy(false);
    }
  };

  const card = {
    background: 'var(--d-surface)', border: '1px solid var(--d-border)',
  } as const;
  const input = {
    background: 'var(--d-surface-2)', border: '1px solid var(--d-border)',
    color: 'var(--d-text)',
  } as const;

  return (
    <div className="rounded-lg" style={card}>
      <Steps step={step} hasPackages={sorted.length > 0} />

      <div className="p-4">
        {/* ───── ١) الباقة ───── */}
        {step === 'package' && (
          <fieldset>
            <legend className="text-[14.5px] font-bold">اختر الباقة</legend>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--d-text-2)' }}>
              باقة واحدة لكل طلب. يمكنك شراء باقة أخرى في طلب منفصل.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {sorted.map((p) => {
                const on = picked === p.id;
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center justify-between
                                      gap-3 rounded-md px-3 py-2.5 text-[13.5px]"
                           style={{
                             border: `1.5px solid ${on ? 'var(--d-accent)' : 'var(--d-border)'}`,
                             background: on ? 'var(--d-accent-weak)' : 'transparent',
                           }}>
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="radio" name="d-package" value={p.id}
                               checked={on} className="size-4"
                               onChange={() => { setPicked(p.id); setError(null); }} />
                        <span className="truncate font-semibold">{p.name}</span>
                      </span>
                      <span className="tabular shrink-0 font-bold"
                            style={{ color: 'var(--d-accent)' }}>
                        {formatMoney(p.price != null ? Number(p.price) : basePrice)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Nav onNext={goDetails} nextLabel="التالي" busy={busy} />
          </fieldset>
        )}

        {/* ───── ٢) بيانات الشحن + التواصل ───── */}
        {step === 'details' && (
          <div>
            <p className="text-[14.5px] font-bold">بيانات الشحن</p>
            {fields.length === 0 && (
              <p className="mt-1 text-[12.5px]" style={{ color: 'var(--d-text-2)' }}>
                لا بيانات إضافية مطلوبة لهذا المنتج.
              </p>
            )}
            <div className="mt-3 space-y-3.5">
              {fields.map((f) => (
                <div key={f.id}>
                  <label htmlFor={`df-${f.id}`}
                         className="block text-[13px] font-semibold">
                    {f.label} <span aria-hidden style={{ color: 'var(--d-danger)' }}>*</span>
                    <span className="sr-only">(مطلوب)</span>
                  </label>
                  <input id={`df-${f.id}`} type="text" required maxLength={120}
                         value={values[f.id] ?? ''}
                         onChange={(e) => setValues(
                           (v) => ({ ...v, [f.id]: e.target.value }))}
                         aria-describedby={f.hint ? `dh-${f.id}` : undefined}
                         className="mt-1.5 h-11 w-full rounded-md px-3 text-[14.5px]
                                    outline-none"
                         style={input} />
                  {f.hint && (
                    <p id={`dh-${f.id}`} className="mt-1 text-[12px] leading-relaxed"
                       style={{ color: 'var(--d-text-2)' }}>
                      {f.hint}
                    </p>
                  )}
                </div>
              ))}

              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="الاسم" value={contact.name} required
                       onChange={(v) => setContact((c) => ({ ...c, name: v }))} />
                <Field label="رقم الهاتف" value={contact.phone} required dir="ltr"
                       onChange={(v) => setContact((c) => ({ ...c, phone: v }))} />
              </div>
              <Field label="البريد الإلكتروني (اختياري)" value={contact.email}
                     dir="ltr" type="email"
                     onChange={(v) => setContact((c) => ({ ...c, email: v }))} />

              <div>
                <label htmlFor="d-qty" className="block text-[13px] font-semibold">
                  الكمية
                </label>
                <input id="d-qty" type="number" min={1} max={99} value={qty}
                       onChange={(e) => setQty(Math.min(Math.max(
                         Number(e.target.value) || 1, 1), 99))}
                       className="mt-1.5 h-11 w-24 rounded-md px-3 text-[14.5px]
                                  outline-none"
                       style={input} />
              </div>
            </div>
            <Nav onBack={sorted.length > 0 ? () => setStep('package') : undefined}
                 onNext={goReview} nextLabel="مراجعة الطلب" busy={busy} />
          </div>
        )}

        {/* ───── ٣) المراجعة ───── */}
        {step === 'review' && (
          <div>
            <p className="text-[14.5px] font-bold">راجع طلبك قبل الدفع</p>
            <dl className="mt-3 divide-y text-[13.5px]"
                style={{ borderColor: 'var(--d-border)' }}>
              <Row k="المنتج" v={productName} />
              {pack && <Row k="الباقة" v={pack.name} />}
              <Row k="الكمية" v={String(qty)} />
              <Row k="السعر" v={formatMoney(total)} strong />
              {fields.map((f) => (
                <Row key={f.id} k={f.label} v={values[f.id] ?? ''} />
              ))}
              <Row k="الاسم" v={contact.name} />
              <Row k="رقم الهاتف" v={contact.phone} />
              {contact.email && <Row k="البريد" v={contact.email} />}
            </dl>
            <p className="mt-3 rounded-md px-3 py-2 text-[12.5px] leading-relaxed"
               style={{ background: 'var(--d-accent-weak)',
                        color: 'var(--d-text-2)' }}>
              تأكّد من صحّة البيانات أعلاه — تُنفَّذ الشحنة عليها كما هي.
            </p>
            <Nav onBack={() => setStep('details')} onNext={goPay}
                 nextLabel="تأكيد ومتابعة الدفع" busy={busy} />
          </div>
        )}

        {/* ───── ٤) الدفع ───── */}
        {step === 'pay' && (
          <div>
            <p className="text-[14.5px] font-bold">الدفع</p>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--d-text-2)' }}>
              حوّل {formatMoney(total)} ثم أرفق الإيصال. يُنفَّذ الطلب بعد
              تأكيد المتجر للدفع.
            </p>

            <fieldset className="mt-3">
              <legend className="sr-only">طريقة الدفع</legend>
              <div className="flex flex-wrap gap-2">
                {methods.bankTransfer && (
                  <Choice on={method === 'bank_transfer'} label="تحويل بنكي"
                          onClick={() => setMethod('bank_transfer')} />
                )}
                {methods.bankak && (
                  <Choice on={method === 'bankak'} label="بنكك"
                          onClick={() => setMethod('bankak')} />
                )}
              </div>
            </fieldset>

            <div className="mt-3.5">
              <label htmlFor="d-ref" className="block text-[13px] font-semibold">
                رقم العملية (اختياري)
              </label>
              <input id="d-ref" type="text" dir="ltr" maxLength={60}
                     value={reference} onChange={(e) => setReference(e.target.value)}
                     className="mt-1.5 h-11 w-full rounded-md px-3 text-[14.5px]
                                outline-none"
                     style={input} />
            </div>

            {/* ★ نفس رافع الإيصال المستعمل في الدفع العادي واشتراك
                المنصّة: الضغط والرفع المباشر إلى المسار الذي أصدرته
                القاعدة، بلا مرور الملف بالخادم. لا رافعٌ ثانٍ. */}
            <div className="mt-3.5">
              <ReceiptUploader
                value={receipt}
                onChange={(v) => { setReceipt(v); setError(null); }}
                label="إيصال التحويل"
                hint="إرفاق الإيصال لا يؤكّد الدفع: يصل طلبك «بانتظار التحقق»،
                      ويؤكّده المتجر بعد وصول المبلغ."
                begin={({ mime, size }) =>
                  beginOrderReceiptUpload({ host, mime, size })}
              />
            </div>

            <Nav onBack={() => setStep('review')} onNext={submit}
                 nextLabel="إتمام الطلب" busy={busy} />
          </div>
        )}

        {error && (
          <p role="alert"
             className="mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-[13px]"
             style={{ background: 'var(--d-surface-2)', color: 'var(--d-danger)' }}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Steps({ step, hasPackages }: { step: Step; hasPackages: boolean }) {
  const all: { key: Step; label: string }[] = [
    ...(hasPackages ? [{ key: 'package' as Step, label: 'الباقة' }] : []),
    { key: 'details', label: 'البيانات' },
    { key: 'review', label: 'المراجعة' },
    { key: 'pay', label: 'الدفع' },
  ];
  const at = all.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto border-b px-4 py-2.5
                   text-[12px]"
        style={{ borderColor: 'var(--d-border)' }}>
      {all.map((s, i) => (
        <li key={s.key} className="flex shrink-0 items-center gap-1">
          <span className="grid size-5 place-items-center rounded-full text-[11px]
                           font-bold"
                style={i <= at
                  ? { background: 'var(--d-accent-surface)', color: 'var(--d-on-accent)' }
                  : { background: 'var(--d-surface-2)', color: 'var(--d-text-3)' }}>
            {i < at ? <Check size={11} aria-hidden /> : i + 1}
          </span>
          <span className="font-semibold"
                style={{ color: i <= at ? 'var(--d-text)' : 'var(--d-text-3)' }}>
            {s.label}
          </span>
          {i < all.length - 1 && (
            <ChevronLeft size={13} aria-hidden style={{ color: 'var(--d-text-3)' }} />
          )}
        </li>
      ))}
    </ol>
  );
}

function Nav({ onBack, onNext, nextLabel, busy }: {
  onBack?: () => void; onNext: () => void | Promise<void>;
  nextLabel: string; busy: boolean;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button type="button" onClick={() => void onNext()} disabled={busy}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2
                         rounded-md text-[14.5px] font-bold disabled:opacity-60"
              style={{ background: 'var(--d-accent-surface)',
                       color: 'var(--d-on-accent)' }}>
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {nextLabel}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} disabled={busy}
                className="h-11 rounded-md px-4 text-[13.5px] font-semibold"
                style={{ border: '1px solid var(--d-border-strong)',
                         color: 'var(--d-text-2)' }}>
          رجوع
        </button>
      )}
    </div>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0" style={{ color: 'var(--d-text-2)' }}>{k}</dt>
      <dd className={`min-w-0 break-words text-end ${strong ? 'font-bold' : 'font-medium'}`}
          style={strong ? { color: 'var(--d-accent)' } : undefined}>
        {v}
      </dd>
    </div>
  );
}

function Field({ label, value, onChange, required = false, dir, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; dir?: 'ltr'; type?: string;
}) {
  const id = `d-${label.replace(/\s/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold">
        {label}
        {required && <span aria-hidden style={{ color: 'var(--d-danger)' }}> *</span>}
      </label>
      <input id={id} type={type} dir={dir} required={required} maxLength={120}
             value={value} onChange={(e) => onChange(e.target.value)}
             className="mt-1.5 h-11 w-full rounded-md px-3 text-[14.5px] outline-none"
             style={{ background: 'var(--d-surface-2)',
                      border: '1px solid var(--d-border)', color: 'var(--d-text)' }} />
    </div>
  );
}

function Choice({ on, label, onClick }: {
  on: boolean; label: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
            className="h-10 rounded-md px-3.5 text-[13.5px] font-semibold"
            style={{
              border: `1.5px solid ${on ? 'var(--d-accent)' : 'var(--d-border)'}`,
              background: on ? 'var(--d-accent-weak)' : 'transparent',
              color: 'var(--d-text)',
            }}>
      {label}
    </button>
  );
}
