'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { saveStoreProfile } from '@/lib/settings/actions';

export type StoreProfile = {
  name: string;
  businessType: string;
  description: string;
  whatsapp: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  addressLine: string;
  orderPrefix: string;
  lowStockThreshold: number;
  codEnabled: boolean;
  bankTransferEnabled: boolean;
  bankakEnabled: boolean;
};

const BUSINESS_TYPES = [
  'ملابس وأزياء', 'إلكترونيات', 'مستحضرات تجميل', 'أغذية ومشروبات',
  'أثاث ومنزل', 'كتب وقرطاسية', 'رياضة', 'هدايا', 'أخرى',
];

export function StoreProfileForm({ storeId, initial, canEdit }: {
  storeId: string; initial: StoreProfile; canEdit: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    setSaved(false);
    const res = await saveStoreProfile({
      storeId,
      name: String(formData.get('name') ?? ''),
      businessType: String(formData.get('business_type') ?? ''),
      description: String(formData.get('description') ?? ''),
      whatsapp: String(formData.get('whatsapp') ?? ''),
      contactPhone: String(formData.get('contact_phone') ?? ''),
      contactEmail: String(formData.get('contact_email') ?? ''),
      city: String(formData.get('city') ?? ''),
      addressLine: String(formData.get('address_line') ?? ''),
      orderPrefix: String(formData.get('order_prefix') ?? ''),
      lowStockThreshold: Number(formData.get('low_stock_threshold') ?? 5),
      codEnabled: formData.get('cod_enabled') === 'on',
      bankTransferEnabled: formData.get('bank_transfer_enabled') === 'on',
      bankakEnabled: formData.get('bankak_enabled') === 'on',
    });

    if (!res.ok) { setError({ message: res.message, field: res.field }); return; }
    setSaved(true);
  });

  const fieldError = (name: string) =>
    error?.field === name ? error.message : undefined;

  return (
    <form action={submit} className="space-y-5">
      {error && !error.field && (
        <div role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3
                        text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
        </div>
      )}

      <Card>
        <CardHeader title="معلومات المتجر"
                    description="تظهر للزبائن في متجرك وفي نتائج البحث." />
        <fieldset disabled={!canEdit} className="space-y-4 p-5">
          <Input name="name" label="اسم المتجر" required maxLength={100}
                 defaultValue={initial.name} error={fieldError('name')} />
          <Select name="business_type" label="نوع النشاط"
                  defaultValue={initial.businessType}>
            <option value="">بلا تحديد</option>
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Textarea name="description" label="وصف المتجر"
                    defaultValue={initial.description}
                    hint="سطران يشرحان ما تبيعه." />
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="التواصل" />
        <fieldset disabled={!canEdit} className="space-y-4 p-5">
          <Input name="whatsapp" label="رقم واتساب" dir="ltr" type="tel"
                 defaultValue={initial.whatsapp} placeholder="249912345678"
                 hint="بصيغة دولية بدون + أو أصفار بادئة."
                 error={fieldError('whatsapp')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="contact_phone" label="هاتف للتواصل" dir="ltr" type="tel"
                   defaultValue={initial.contactPhone} />
            <Input name="contact_email" label="بريد للتواصل" dir="ltr" type="email"
                   defaultValue={initial.contactEmail} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="city" label="المدينة" defaultValue={initial.city} />
            <Input name="address_line" label="العنوان" defaultValue={initial.addressLine} />
          </div>
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="طرق الدفع"
                    description="في الإصدار الأول: تحويل بنكي · بنكك · الدفع عند الاستلام." />
        <fieldset disabled={!canEdit} className="space-y-2 p-5">
          <Switch name="cod_enabled" label="الدفع عند الاستلام"
                  hint="الزبون يدفع نقدًا عند وصول الطلب."
                  defaultChecked={initial.codEnabled} />
          <Switch name="bank_transfer_enabled" label="التحويل البنكي"
                  hint="الزبون يحوّل ويرسل إثبات التحويل."
                  defaultChecked={initial.bankTransferEnabled} />
          <Switch name="bankak_enabled" label="بنكك"
                  hint="تحويل عبر بنكك بإثبات يدوي — لا يوجد تكامل آلي."
                  defaultChecked={initial.bankakEnabled} />
          {fieldError('payments') && (
            <p role="alert" className="text-sm text-danger">
              {fieldError('payments')}
            </p>
          )}
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="الطلبات والمخزون" />
        <fieldset disabled={!canEdit} className="grid gap-4 p-5 sm:grid-cols-2">
          <Input name="order_prefix" label="بادئة رقم الطلب" dir="ltr" maxLength={6}
                 defaultValue={initial.orderPrefix} placeholder="NM"
                 hint="تظهر قبل الرقم المتسلسل، مثال: NM-00001."
                 error={fieldError('orderPrefix')} />
          <Input name="low_stock_threshold" label="حد تنبيه المخزون" type="number"
                 min={0} step="1" inputMode="numeric" dir="ltr"
                 defaultValue={initial.lowStockThreshold}
                 hint="ننبّهك عند هبوط كمية منتج إلى هذا الحد." />
        </fieldset>
      </Card>

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" loading={pending}>حفظ الإعدادات</Button>
          {saved && (
            <span role="status" className="inline-flex items-center gap-1 text-sm
                             font-bold text-success">
              <Check size={15} /> حُفظت التغييرات
            </span>
          )}
        </div>
      )}
    </form>
  );
}
