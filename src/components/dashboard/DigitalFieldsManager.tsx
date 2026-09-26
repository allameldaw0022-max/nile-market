'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Switch } from '@/components/ui/Field';
import {
  removeDigitalField, saveDigitalField, type DigitalFieldRow,
} from '@/lib/digital/dashboard';

/**
 * حقول الشحن الرقمية لمنتج.
 *
 * ★★ ميزة القالب الرقمي وحده: المنتج العادي لا حقول له، فلا يُطلب من
 * زبونه شيء. ولا تظهر هذه الشاشة إلا حين يكون قالب المتجر رقميًّا.
 *
 * ★★ وكل حقل يضيفه التاجر **إلزامي** على العميل — وهذا مفروض في
 * القاعدة: `create_digital_order` تقرأ الحقول الفعّالة من الجدول
 * وترفض الطلب إن نقص أحدها. فلا اعتماد على تحقّق الواجهة.
 *
 * ★ والحذف ناعم: لقطة الطلبات السابقة في `order_digital_values` تبقى
 * كما هي، فسجلّ طلبٍ نُفِّذ لا يُمحى بحذف تعريف حقل.
 */
export function DigitalFieldsManager({ storeId, productId, fields, canEdit }: {
  storeId: string; productId: string; fields: DigitalFieldRow[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DigitalFieldRow> | null>(null);

  const save = () => start(async () => {
    if (!draft?.label?.trim()) { setError('اسم الحقل مطلوب'); return; }
    setError(null);
    const res = await saveDigitalField({
      storeId, productId,
      label: draft.label,
      fieldId: draft.id ?? null,
      hint: draft.hint ?? undefined,
      sortOrder: draft.sortOrder,
      isActive: draft.isActive ?? true,
    });
    if (!res.ok) { setError(res.message); return; }
    setDraft(null);
    router.refresh();
  });

  return (
    <Card>
      <CardHeader
        title="بيانات الشحن المطلوبة من العميل"
        description="ما يحتاجه تنفيذ الطلب: رقم اللاعب، السيرفر، رقم الحساب…
                     كل حقل تضيفه إلزامي على العميل."
        action={canEdit && fields.length < 8
          ? <Button size="sm" variant="outline" icon={<Plus size={14} />}
                    onClick={() => setDraft({
                      label: '', hint: '', isActive: true,
                      sortOrder: fields.length,
                    })}>
              حقل جديد
            </Button>
          : undefined} />

      <div className="space-y-3 p-5">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md border
                                     border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </p>
        )}

        {fields.length === 0 && !draft && (
          <p className="text-[12.5px] text-ink-500">
            لا حقول — لن يُطلب من العميل أي بيانات إضافية لهذا المنتج.
          </p>
        )}

        <ul className="space-y-2">
          {fields.map((f, i) => (
            <li key={f.id}
                className="flex flex-wrap items-center gap-2.5 rounded-md border
                           border-ink-200 p-3">
              <span className="text-ink-300" aria-hidden>
                <GripVertical size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  {f.label}
                  {!f.isActive && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]
                                     font-medium text-ink-500">معطَّل</span>
                  )}
                </span>
                {f.hint && (
                  <span className="mt-0.5 block text-xs text-ink-500">{f.hint}</span>
                )}
              </span>
              {canEdit && (
                <span className="flex shrink-0 gap-1.5">
                  {i > 0 && (
                    <Button size="sm" variant="ghost" loading={pending}
                            onClick={() => start(async () => {
                              const res = await saveDigitalField({
                                storeId, productId, label: f.label,
                                fieldId: f.id, hint: f.hint ?? undefined,
                                sortOrder: i - 1,
                              });
                              if (!res.ok) { setError(res.message); return; }
                              router.refresh();
                            })}>
                      أعلى
                    </Button>
                  )}
                  <Button size="sm" variant="outline"
                          onClick={() => setDraft(f)}>تعديل</Button>
                  <Button size="sm" variant="danger" icon={<Trash2 size={14} />}
                          loading={pending}
                          onClick={() => start(async () => {
                            const res = await removeDigitalField({
                              storeId, fieldId: f.id,
                            });
                            if (!res.ok) { setError(res.message); return; }
                            router.refresh();
                          })}>
                    حذف
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {draft && (
          <div className="space-y-3 rounded-md border border-teal-300 bg-teal-50/40 p-4">
            <Input label="اسم الحقل" required maxLength={60}
                   placeholder="رقم اللاعب" value={draft.label ?? ''}
                   onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
            <Input label="تعليمة تحت الحقل (اختياري)" maxLength={200}
                   placeholder="أدخل رقم اللاعب كما يظهر داخل اللعبة وتأكّد من صحّته."
                   value={draft.hint ?? ''}
                   onChange={(e) => setDraft((d) => ({ ...d, hint: e.target.value }))} />
            <Switch label="مطلوب من العميل"
                    hint="تعطيله يُخفي الحقل من نموذج الشراء."
                    checked={draft.isActive !== false}
                    onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />
            <div className="flex gap-2">
              <Button loading={pending} onClick={save}>حفظ الحقل</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>إلغاء</Button>
            </div>
          </div>
        )}

        {fields.length >= 8 && (
          <p className="text-[12px] text-ink-500">
            بلغت الحدّ الأقصى (ثمانية حقول) — نموذج شراء أطول من ذلك يُفقد الطلبات.
          </p>
        )}
      </div>
    </Card>
  );
}
