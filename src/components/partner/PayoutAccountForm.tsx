'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Landmark, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { savePayoutAccount, type PayoutAccount } from '@/lib/partners/actions';

/**
 * بيانات استلام الأرباح.
 *
 * ★ الوسيلتان هما وسيلتا المنصة نفسها — لا وسيلة مخترعة.
 * ★ الشريك يرى بياناته هو فقط، والقاعدة تتحقق من اكتمالها قبل أي
 * طلب صرف؛ هذه الواجهة تعطي رسالة أوضح لا حماية إضافية.
 * ★ طلب صرف قائم يحمل لقطته الخاصة — تعديل هذه البيانات لا يغيّره.
 */
export function PayoutAccountForm({ account }: { account: PayoutAccount }) {
  const router = useRouter();
  const [method, setMethod] = useState<'bank_transfer' | 'bankak'>(
    account.method ?? 'bank_transfer');
  const [beneficiary, setBeneficiary] = useState(account.beneficiary ?? '');
  const [bank, setBank] = useState(account.bank ?? '');
  const [acct, setAcct] = useState(account.account ?? '');
  const [phone, setPhone] = useState(account.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setError(null);
    setSaved(false);
    const res = await savePayoutAccount({
      method, beneficiary, bank, account: acct, phone,
    });
    if (!res.ok) { setError(res.message); return; }
    setSaved(true);
    router.refresh();
  });

  return (
    <Card>
      <CardHeader title="بيانات استلام العمولات"
                  description="إليها نحوّل مستحقاتك بعد اعتماد طلب الصرف." />
      <div className="space-y-4 p-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border
                          border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}
        {saved && !error && (
          <p className="flex items-center gap-1.5 text-sm font-bold text-success">
            <Check size={15} /> حُفظت البيانات
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-bold text-ink-700">
            وسيلة الاستلام
          </legend>
          {([
            { value: 'bank_transfer' as const, label: 'تحويل بنكي',
              hint: 'اسم البنك ورقم الحساب.' },
            { value: 'bankak' as const, label: 'بنكك',
              hint: 'رقم الهاتف المسجَّل في بنكك.' },
          ]).map((m) => (
            <label key={m.value}
                   className={`flex cursor-pointer items-start gap-3 rounded-md
                               border p-3.5 ${method === m.value
                                 ? 'border-teal-600 bg-teal-50'
                                 : 'border-ink-200 hover:border-teal-300'}`}>
              <input type="radio" name="method" value={m.value}
                     checked={method === m.value}
                     onChange={() => setMethod(m.value)}
                     className="mt-0.5 size-4 accent-teal-600" />
              <span>
                <span className="block text-sm font-bold text-ink-900">{m.label}</span>
                <span className="block text-xs text-ink-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Input label="اسم المستفيد" value={beneficiary} required
               onChange={(e) => setBeneficiary(e.target.value)}
               hint="كما هو مسجَّل لدى البنك أو بنكك." />

        {method === 'bank_transfer' ? (
          <>
            <Input label="اسم البنك" value={bank} required
                   onChange={(e) => setBank(e.target.value)} />
            <Input label="رقم الحساب" value={acct} dir="ltr" required
                   inputMode="numeric"
                   onChange={(e) => setAcct(e.target.value)} />
          </>
        ) : (
          <Input label="رقم الهاتف" value={phone} dir="ltr" type="tel" required
                 inputMode="tel" placeholder="0912345678"
                 onChange={(e) => setPhone(e.target.value)} />
        )}

        <Button loading={pending} icon={<Save size={15} />} onClick={save}>
          حفظ البيانات
        </Button>

        <p className="flex items-start gap-1.5 text-xs text-ink-500">
          <Landmark size={13} className="mt-0.5 shrink-0" />
          يراها فريق الصرف عند معالجة طلبك فقط. طلب صرف قائم يحتفظ
          بالبيانات التي أرسلتها وقته.
        </p>
      </div>
    </Card>
  );
}
