'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Switch, Textarea } from '@/components/ui/Field';
import { savePlatformSettings } from '@/lib/admin/actions';

type BankAccount = { bank: string; account: string; holder?: string };

export type PlatformSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  commercialLaunchEnabled: boolean;
  gracePeriodDays: number;
  expiringWarningDays: number;
  defaultPartnerRate: number;
  supportEmail: string | null;
  bankAccounts: BankAccount[];
  bankakNumber: string | null;
  paymentInstructions: string | null;
  legal: Record<string, string>;
};

const LEGAL_DOCS = [
  { key: 'terms',        label: 'الشروط والأحكام' },
  { key: 'privacy',      label: 'سياسة الخصوصية' },
  { key: 'subscription', label: 'سياسة الاشتراك' },
  { key: 'cancellation', label: 'سياسة الإلغاء والاسترداد' },
];

/**
 * نموذج إعدادات المنصة.
 *
 * ★ حسابات الاستلام تُعرض للتاجر عبر `platform_payment_info()` وحدها،
 * لا بقراءة صف الإعدادات: التاجر يحتاج رقم الحساب لا بقيّة الإعدادات.
 */
export function PlatformSettingsForm({ settings, canManage, launchBlockers }: {
  settings: PlatformSettings; canManage: boolean; launchBlockers: string[];
}) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const save = () => start(async () => {
    setError(null);
    setSaved(false);
    const res = await savePlatformSettings({
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
      commercialLaunchEnabled: s.commercialLaunchEnabled,
      gracePeriodDays: s.gracePeriodDays,
      expiringWarningDays: s.expiringWarningDays,
      defaultPartnerRate: s.defaultPartnerRate,
      supportEmail: s.supportEmail,
      bankAccounts: s.bankAccounts.filter((b) => b.bank.trim() && b.account.trim()),
      bankakNumber: s.bankakNumber,
      paymentInstructions: s.paymentInstructions,
      legal: s.legal,
    });
    if (!res.ok) { setError(res.message); return; }
    setSaved(true);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {launchBlockers.length > 0 && (
        <Card className="border-gold-500/40 bg-gold-300/10 p-5">
          <h2 className="flex items-center gap-2 font-bold text-ink-900">
            <AlertTriangle size={17} className="text-gold-700" />
            الإطلاق التجاري لا يُفعَّل بعد
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-700">
            {launchBlockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="mt-2 text-xs text-ink-700">
            القاعدة ترفض التفعيل ما دام أحدها قائمًا (D31) — التبديل هنا
            لن يغيّر ذلك.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader title="التشغيل" />
        <div className="space-y-4 p-5">
          <Switch label="وضع الصيانة"
                  hint="يحجب الواجهة عن التجار ويُبقي الإدارة تعمل."
                  checked={s.maintenanceMode}
                  onChange={(v) => set('maintenanceMode', v)} />
          <Textarea label="رسالة الصيانة" value={s.maintenanceMessage ?? ''}
                    disabled={!canManage}
                    onChange={(e) => set('maintenanceMessage', e.target.value)} />
          <Switch label="الإطلاق التجاري"
                  hint="يفتح بيع الباقات. لا يُفعَّل قبل اكتمال الضبط."
                  checked={s.commercialLaunchEnabled}
                  onChange={(v) => set('commercialLaunchEnabled', v)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="الاشتراكات والعمولات" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Input label="فترة السماح (أيام)" type="number" min={0}
                 disabled={!canManage} value={s.gracePeriodDays}
                 onChange={(e) => set('gracePeriodDays', Number(e.target.value))} />
          <Input label="التنبيه قبل الانتهاء (أيام)" type="number" min={0}
                 disabled={!canManage} value={s.expiringWarningDays}
                 onChange={(e) => set('expiringWarningDays', Number(e.target.value))} />
          <Input label="نسبة عمولة الشريك الافتراضية %" type="number"
                 min={0} max={100} step="0.01" disabled={!canManage}
                 value={s.defaultPartnerRate}
                 onChange={(e) => set('defaultPartnerRate', Number(e.target.value))} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="استلام مدفوعات الاشتراك"
          description="يراها التاجر عند تسديد الاشتراك فقط — لا تُعرض علنًا."
        />
        <div className="space-y-4 p-5">
          {s.bankAccounts.map((b, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input label="البنك" value={b.bank} disabled={!canManage}
                     onChange={(e) => set('bankAccounts', s.bankAccounts.map(
                       (x, j) => j === i ? { ...x, bank: e.target.value } : x))} />
              <Input label="رقم الحساب" dir="ltr" value={b.account} disabled={!canManage}
                     onChange={(e) => set('bankAccounts', s.bankAccounts.map(
                       (x, j) => j === i ? { ...x, account: e.target.value } : x))} />
              <Input label="اسم صاحب الحساب" value={b.holder ?? ''} disabled={!canManage}
                     onChange={(e) => set('bankAccounts', s.bankAccounts.map(
                       (x, j) => j === i ? { ...x, holder: e.target.value } : x))} />
              {canManage && (
                <button type="button" aria-label="حذف الحساب"
                        onClick={() => set('bankAccounts',
                          s.bankAccounts.filter((_, j) => j !== i))}
                        className="mt-6 h-11 rounded-[--radius-md] border
                                   border-ink-300 px-3 text-[--color-danger]
                                   hover:border-[--color-danger]">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}

          {canManage && (
            <Button variant="outline" size="sm" icon={<Plus size={15} />}
                    onClick={() => set('bankAccounts',
                      [...s.bankAccounts, { bank: '', account: '', holder: '' }])}>
              إضافة حساب
            </Button>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="رقم بنكك" dir="ltr" value={s.bankakNumber ?? ''}
                   disabled={!canManage}
                   onChange={(e) => set('bankakNumber', e.target.value)} />
            <Input label="بريد الدعم" type="email" dir="ltr"
                   value={s.supportEmail ?? ''} disabled={!canManage}
                   onChange={(e) => set('supportEmail', e.target.value)} />
          </div>

          <Textarea label="تعليمات التحويل" value={s.paymentInstructions ?? ''}
                    disabled={!canManage}
                    hint="تظهر للتاجر مع بيانات الحساب."
                    onChange={(e) => set('paymentInstructions', e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="الوثائق القانونية"
          description="تُعرض على /legal — وما لا يُكتب هنا يظهر «لم تُنشر بعد» لا نصًّا افتراضيًا."
        />
        <div className="space-y-4 p-5">
          <p className="rounded-[--radius-md] bg-ink-50 p-3 text-xs text-ink-600">
            صفحة التسجيل تطلب الموافقة على الشروط وسياسة الخصوصية، فاكتبهما
            قبل فتح التسجيل. ويجب أن توثّق سياسة الخصوصية نطاق إخفاء الهوية:
            يشمل بيانات الحسابات والعملاء ولا يمسّ الطلبات ولا السجلات
            المالية (D32).
          </p>
          {LEGAL_DOCS.map((doc) => (
            <Textarea key={doc.key} label={doc.label} disabled={!canManage}
                      value={s.legal[doc.key] ?? ''}
                      className="min-h-32"
                      onChange={(e) => set('legal',
                        { ...s.legal, [doc.key]: e.target.value })} />
          ))}
        </div>
      </Card>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3 text-sm
                        text-[--color-danger]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      {saved && (
        <p className="flex items-center gap-2 text-sm text-[--color-success]">
          <CheckCircle2 size={15} />حُفظت الإعدادات.
        </p>
      )}

      {canManage && (
        <Button loading={pending} icon={<Save size={15} />} onClick={save}>
          حفظ الإعدادات
        </Button>
      )}
    </div>
  );
}
