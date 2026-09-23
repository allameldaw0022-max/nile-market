'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { saveBankAccounts, type BankAccount } from '@/lib/settings/actions';
import { StoreLogoUploader } from '@/components/dashboard/MediaUploader';

/**
 * الحسابات البنكية.
 *
 * تُحفظ في `store_payment_settings` المفصول عن بقية الإعدادات، ولا
 * تخرج للزبون إلا عبر `order_payment_instructions` لمن طلب بتحويل
 * وأثبت صلته بطلبه — لا من قراءة عامة للجدول.
 */
export function BankAccountsForm({ storeId, initialAccounts, initialBankak, canEdit }: {
  storeId: string;
  initialAccounts: BankAccount[];
  initialBankak: string;
  canEdit: boolean;
}) {
  const [accounts, setAccounts] = useState<BankAccount[]>(
    initialAccounts.length > 0 ? initialAccounts : [{ bank: '', account: '' }],
  );
  const [bankak, setBankak] = useState(initialBankak);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const update = (index: number, patch: Partial<BankAccount>) => {
    setAccounts(accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)));
    setSaved(false);
  };

  const submit = () => start(async () => {
    setError(null);
    setSaved(false);
    const res = await saveBankAccounts({ storeId, accounts, bankakNumber: bankak });
    if (!res.ok) { setError(res.message); return; }
    setSaved(true);
  });

  return (
    <Card>
      <CardHeader title="الحسابات البنكية"
                  description="تظهر للزبون بعد طلبه بتحويل بنكي فقط." />
      <div className="space-y-4 p-5">
        <p className="flex items-center gap-1.5 text-xs text-ink-500">
          <Lock size={12} /> لا تُعرض هذه البيانات في صفحات المتجر العامة.
        </p>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border
                          border-danger/30 bg-danger-bg p-3
                          text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        <ul className="space-y-3">
          {accounts.map((account, i) => (
            <li key={i} className="space-y-3 rounded-md border border-ink-200 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <Input label="البنك" value={account.bank} disabled={!canEdit}
                       placeholder="بنك الخرطوم"
                       onChange={(e) => update(i, { bank: e.target.value })} />
                <Input label="رقم الحساب" value={account.account} dir="ltr"
                       disabled={!canEdit} maxLength={40}
                       onChange={(e) => update(i, { account: e.target.value })} />
                <Input label="اسم صاحب الحساب" value={account.holder ?? ''}
                       disabled={!canEdit}
                       onChange={(e) => update(i, { holder: e.target.value })} />
                {canEdit && (
                  <button type="button" aria-label="حذف الحساب"
                          onClick={() => {
                            setAccounts(accounts.filter((_, j) => j !== i));
                            setSaved(false);
                          }}
                          className="mb-1.5 rounded p-2 text-danger
                                     hover:bg-danger-bg">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* ★ شعار البنك: يساعد الزبون على التعرّف على الحساب
                  الصحيح بين عدّة حسابات قبل التحويل. اختياري — حساب
                  بلا شعار يبقى صالحًا تمامًا. */}
              <div className="border-t border-ink-100 pt-3">
                <p className="mb-2 text-[13px] font-bold text-ink-700">
                  شعار البنك <span className="font-medium text-ink-500">(اختياري)</span>
                </p>
                {canEdit ? (
                  <StoreLogoUploader
                    storeId={storeId}
                    currentUrl={account.logo ?? null}
                    compact
                    alt={account.bank ? `شعار ${account.bank}` : 'شعار البنك'}
                    addLabel="ارفع الشعار"
                    changeLabel="تغيير الشعار"
                    onUploaded={(url) => update(i, { logo: url })}
                    onRemove={() => update(i, { logo: undefined })}
                  />
                ) : account.logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={account.logo} alt={`شعار ${account.bank}`}
                       width={64} height={64}
                       className="size-16 rounded-lg border border-ink-200
                                  bg-white object-contain p-1" />
                ) : (
                  <p className="text-[13px] text-ink-500">لا يوجد شعار.</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {canEdit && accounts.length < 10 && (
          <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />}
                  onClick={() => setAccounts([...accounts, { bank: '', account: '' }])}>
            إضافة حساب
          </Button>
        )}

        <div className="border-t border-ink-200 pt-4">
          <Input label="رقم بنكك" value={bankak} dir="ltr" disabled={!canEdit}
                 onChange={(e) => { setBankak(e.target.value); setSaved(false); }}
                 hint="يظهر للزبون الذي يختار الدفع عبر بنكك." />
        </div>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button loading={pending} onClick={submit}>حفظ بيانات التحويل</Button>
            {saved && (
              <span role="status" className="inline-flex items-center gap-1 text-sm
                               font-bold text-success">
                <Check size={15} /> حُفظت
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
