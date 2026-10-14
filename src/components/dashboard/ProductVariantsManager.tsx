'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Switch } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/money/format';
import {
  deleteProductVariant, saveProductVariant, type ProductVariant,
} from '@/lib/products/variants';

/**
 * ألوان المنتج ومقاساته.
 *
 * ★★★ لماذا هذه الشاشة: الخاصّية كانت مبنيّة تحت الواجهة بالكامل —
 * جدول الخيارات منذ 0004، ومخزونٌ لكل خيار، وسلّةٌ وطلبٌ يحملانه،
 * ومُختارٌ في صفحة المنتج يتبع سعر المختار ويعلن «نفد» للخيار وحده —
 * ولا زرَّ يُنشئ خيارًا. فلم يستعملها تاجرٌ واحد منذ الإطلاق.
 *
 * ★★ مجموعة واحدة لكل منتج في هذه المرحلة («اللون» أو «المقاس»)، لأن
 * «أحمر، أزرق» أو «S، M، L» هو ما يطلبه التاجر فعلًا. واسم المجموعة
 * يُحفظ مفتاحًا في `options`، فإضافة مجموعةٍ ثانية لاحقًا (لون × مقاس)
 * لا تحتاج هجرة ولا تمسّ بيانًا.
 *
 * ★ والسعر الفارغ يعني «سعر المنتج»: متجرٌ ألوانه بسعرٍ واحد لا يكرّر
 *   الرقم أربع مرّات فينساه في واحدة.
 *
 * ★ والكمّية تُقبل عند الإنشاء وحده — بعده تغييرها حركةُ مخزون تُسجَّل
 *   من صفحة المخزون (قاعدة ٥).
 */
export function ProductVariantsManager({ storeId, productId, variants, canManage }: {
  storeId: string;
  productId: string;
  variants: ProductVariant[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductVariant | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  // المجموعة تثبت على ما اختاره التاجر أوّلًا — تُسأل مرّة واحدة.
  const group = variants[0]?.group ?? null;
  const close = () => { setEditing(null); setCreating(false); setError(null); };

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    const numberOrNull = (key: string) => {
      const raw = String(formData.get(key) ?? '').trim();
      if (raw === '') return null;
      const n = Number(raw.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    const res = await saveProductVariant({
      storeId,
      productId,
      variantId: editing?.id ?? null,
      value: String(formData.get('value') ?? ''),
      group: group ?? String(formData.get('group') ?? ''),
      price: numberOrNull('price'),
      compareAtPrice: numberOrNull('compare_at_price'),
      sku: String(formData.get('sku') ?? ''),
      isActive: formData.get('is_active') === 'on',
      initialQuantity: numberOrNull('quantity'),
      lowStockThreshold: numberOrNull('low_stock_threshold'),
    });

    if (!res.ok) { setError({ message: res.message, field: res.field }); return; }
    close();
    router.refresh();
  });

  const remove = (variant: ProductVariant) => start(async () => {
    setError(null);
    const res = await deleteProductVariant(storeId, variant.id);
    if (!res.ok) { setError({ message: res.message }); return; }
    router.refresh();
  });

  const form = creating || editing !== null;

  return (
    <Card>
      <CardHeader
        title="الألوان والمقاسات"
        description={group
          ? `خيارات هذا المنتج حسب «${group}». الزبون يختار قبل الشراء.`
          : 'للمنتج الواحد ألوان أو مقاسات، ولكل خيار سعره ومخزونه.'} />

      <div className="space-y-4 p-5">
        {error && !error.field && (
          <div role="alert" className="flex items-start gap-2 rounded-md border
                          border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
          </div>
        )}

        {variants.length > 0 ? (
          <ul className="divide-y divide-ink-200 rounded-md border border-ink-200">
            {variants.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="font-bold text-ink-900">{v.value}</span>
                <span className="tabular text-sm text-ink-600">
                  {v.price === null ? 'سعر المنتج' : formatMoney(v.price)}
                </span>
                {v.sku && (
                  <span className="text-xs text-ink-500" dir="ltr">{v.sku}</span>
                )}
                <Badge tone={v.available > 0 ? 'success' : 'danger'}>
                  {v.available > 0 ? `المتوفّر ${v.available}` : 'نفد'}
                </Badge>
                {!v.isActive && <Badge tone="neutral">معطّل</Badge>}

                {canManage && (
                  <span className="ms-auto flex gap-1">
                    <Button type="button" variant="ghost" size="sm"
                            icon={<Pencil size={14} />} disabled={pending}
                            onClick={() => { setCreating(false); setEditing(v); }}>
                      تعديل
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                            icon={<Trash2 size={14} />} disabled={pending}
                            onClick={() => remove(v)}>
                      حذف
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-start gap-2 rounded-md border border-ink-200
                        bg-ink-50 p-3 text-sm text-ink-600">
            <Palette size={16} className="mt-0.5 shrink-0 text-ink-400" />
            لا خيارات لهذا المنتج — يُشترى كما هو. أضف خيارًا إن كان له
            ألوان أو مقاسات.
          </p>
        )}

        {/* ★ تحذيرٌ لازم: بعد أوّل خيار يصير المخزون محسوبًا لكل خيار،
            فمنتجٌ رصيده ١٠ وخيارٌ بلا كمّية يظهر «نفد» — وهو صحيح لا عطل. */}
        {variants.length > 0 && (
          <p className="text-xs text-ink-500">
            ★ بعد إضافة الخيارات يُحسب المخزون لكل خيار على حدة، ولا يُحسب
            رصيد المنتج العام. تعديل الكمّيات من صفحة المخزون.
          </p>
        )}

        {canManage && !form && (
          <Button type="button" variant="outline" icon={<Plus size={16} />}
                  onClick={() => setCreating(true)}>
            {variants.length === 0 ? 'إضافة خيارات (لون · مقاس)' : 'خيار جديد'}
          </Button>
        )}

        {form && (
          <form action={submit} className="space-y-4 rounded-md border
                                           border-ink-200 bg-ink-50 p-4">
            {!group && !editing && (
              <Input name="group" label="نوع الخيار" required maxLength={40}
                     className="w-full" defaultValue="اللون"
                     hint="«اللون» أو «المقاس» أو «الحجم». يُسأل مرّة واحدة لكل منتج."
                     error={error?.field === 'group' ? error.message : undefined} />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="value" label={group ? group : 'الخيار'} required
                     maxLength={60} className="w-full"
                     defaultValue={editing?.value ?? ''}
                     placeholder="مثال: أحمر"
                     error={error?.field === 'value' ? error.message : undefined} />
              <Input name="sku" label="رمز المنتج (SKU)" dir="ltr" className="w-full"
                     defaultValue={editing?.sku ?? ''}
                     hint="اختياري، وفريد داخل متجرك."
                     error={error?.field === 'sku' ? error.message : undefined} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="price" label="سعر هذا الخيار" type="number" min={0}
                     step="0.01" inputMode="decimal" dir="ltr" className="w-full"
                     defaultValue={editing?.price ?? ''}
                     hint="اتركه فارغًا ليأخذ سعر المنتج."
                     error={error?.field === 'price' ? error.message : undefined} />
              <Input name="compare_at_price" label="السعر قبل الخصم" type="number"
                     min={0} step="0.01" inputMode="decimal" dir="ltr"
                     className="w-full"
                     defaultValue={editing?.compareAtPrice ?? ''}
                     hint="اختياري، ويجب أن يكون أعلى من السعر." />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {editing ? (
                <Input label="المتوفّر الآن" dir="ltr" className="w-full"
                       value={editing.available} readOnly disabled
                       hint="التعديل من صفحة المخزون ليُسجَّل كحركة." />
              ) : (
                <Input name="quantity" label="الكمية الابتدائية" type="number" min={0}
                       step="1" inputMode="numeric" dir="ltr" className="w-full"
                       defaultValue="0"
                       hint="خيارٌ بلا كمّية يظهر «نفد» للزبون." />
              )}
              <Input name="low_stock_threshold" label="حد التنبيه" type="number"
                     min={0} step="1" inputMode="numeric" dir="ltr"
                     className="w-full"
                     defaultValue={editing?.lowStockThreshold ?? ''}
                     hint="ننبّهك عند هبوط مخزون هذا الخيار إليه." />
            </div>

            <Switch name="is_active" label="الخيار معروض للزبون"
                    hint="غير المعروض لا يظهر في صفحة المنتج."
                    defaultChecked={editing?.isActive ?? true} />

            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                {editing ? 'حفظ الخيار' : 'إضافة الخيار'}
              </Button>
              <Button type="button" variant="ghost" onClick={close}>إلغاء</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
