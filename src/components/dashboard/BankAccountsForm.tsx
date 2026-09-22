'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { saveBankAccounts, type BankAccount } from '@/lib/settings/actions';

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
        <p className="flex items-center gap-1.5 text-xs text-sand-600">
          <Lock size={12} /> لا تُعرض هذه البيانات في صفحات المتجر العامة.
        </p>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                          border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                          text-sm text-[--color-danger]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        <ul className="space-y-3">
          {accounts.map((account, i) => (
            <li key={i} className="grid gap-3 rounded-[--radius-md] border
                                   border-sand-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]
                                   sm:items-end">
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
                        className="mb-1.5 rounded p-2 text-[--color-danger]
                                   hover:bg-[--color-danger-bg]">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canEdit && accounts.length < 10 && (
          <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />}
                  onClick={() => setAccounts([...accounts, { bank: '', account: '' }])}>
            إضافة حساب
          </Button>
        )}

        <div className="border-t border-sand-200 pt-4">
          <Input label="رقم بنكك" value={bankak} dir="ltr" disabled={!canEdit}
                 onChange={(e) => { setBankak(e.target.value); setSaved(false); }}
                 hint="يظهر للزبون الذي يختار الدفع عبر بنكك." />
        </div>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button loading={pending} onClick={submit}>حفظ بيانات التحويل</Button>
            {saved && (
              <span role="status" className="inline-flex items-center gap-1 text-sm
                               font-bold text-[--color-success]">
                <Check size={15} /> حُفظت
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
