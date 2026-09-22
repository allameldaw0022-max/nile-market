'use client';
import { useEffect, useState, useTransition } from 'react';
import Image from 'next/image';
import { AlertTriangle, ChevronLeft, Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Field';
import { ProductImagesUploader, type UploadedMedia } from '@/components/dashboard/MediaUploader';
import { formatMoney } from '@/lib/money/format';
import { deleteProduct, saveProduct } from '@/app/(dashboard)/dashboard/products/actions';
import { listOnboardingProducts, type OnboardingProduct } from './actions';

/**
 * أول منتج. يُنشأ فورًا في القاعدة لا في حالة محلية: المتجر لا يُنشر
 * بلا منتج (publish_store)، والمنتج الموجود يجعل الخطوة قابلة
 * للاستئناف بعد إغلاق المتصفح.
 */
export function FirstProductStep({ storeId, count, onChange, onNext }: {
  storeId: string;
  count: number;
  onChange: (count: number) => void;
  onNext: () => void;
}) {
  const [products, setProducts] = useState<OnboardingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(count === 0);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);
  const [images, setImages] = useState<UploadedMedia[]>([]);
  const [pending, start] = useTransition();

  const refresh = () => start(async () => {
    const res = await listOnboardingProducts(storeId);
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setError(null);
    setProducts(res.data);
    onChange(res.data.length);
    if (res.data.length > 0) setShowForm(false);
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [storeId]);

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    setFieldError(null);
    formData.set('store_id', storeId);
    formData.set('images_touched', '1');
    for (const media of images) formData.append('image_media_ids', media.mediaId);

    const res = await saveProduct(formData);
    if (!res.ok) {
      setFieldError({ field: res.field, message: res.message });
      return;
    }
    setImages([]);
    setShowForm(false);
    refresh();
  });

  const remove = (id: string) => start(async () => {
    const res = await deleteProduct(storeId, id);
    if (!res.ok) { setError(res.message); return; }
    refresh();
  });

  return (
    <Card>
      <div className="border-b border-sand-200 px-5 py-4">
        <h2 className="font-bold text-navy-900">أول منتج</h2>
        <p className="mt-0.5 text-sm text-sand-600">
          منتج واحد على الأقل مطلوب لنشر المتجر. يمكنك إضافة الباقي لاحقًا.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                          border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                          text-sm text-[--color-danger]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-sand-600">يحمّل المنتجات…</p>
        ) : products.length > 0 && (
          <ul className="divide-y divide-sand-200 rounded-[--radius-md] border border-sand-200">
            {products.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-[--radius-md]
                                border border-sand-200 bg-sand-50">
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-sand-400">
                      <Package size={18} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-navy-900">{p.name}</p>
                  <p className="text-xs text-sand-600 tabular">
                    {formatMoney(p.price)} · المخزون {p.quantity}
                  </p>
                </div>
                <button type="button" aria-label={`حذف ${p.name}`}
                        onClick={() => remove(p.id)} disabled={pending}
                        className="rounded p-2 text-[--color-danger] hover:bg-[--color-danger-bg]
                                   disabled:opacity-50">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {showForm ? (
          <form action={submit} className="space-y-4 rounded-[--radius-md]
                                           border border-sand-200 p-4">
            <Input name="name" label="اسم المنتج" required maxLength={200}
                   placeholder="مثال: قميص قطن رجالي"
                   error={fieldError?.field === 'name' ? fieldError.message : undefined} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="price" label="السعر" required type="number" min={0} step="0.01"
                     inputMode="decimal" dir="ltr" hint="بالجنيه السوداني"
                     error={fieldError?.field === 'price' ? fieldError.message : undefined} />
              <Input name="quantity" label="الكمية المتوفرة" type="number" min={0} step="1"
                     inputMode="numeric" dir="ltr" defaultValue={1} />
            </div>

            <Textarea name="description" label="وصف المنتج (اختياري)"
                      hint="اذكر المقاسات أو الألوان أو أي تفصيل يسأل عنه الزبون." />

            <div className="space-y-1.5">
              <span className="block text-[13px] font-bold text-navy-700">صور المنتج</span>
              <ProductImagesUploader storeId={storeId} value={images}
                                     onChange={setImages} max={5} />
            </div>

            <input type="hidden" name="status" value="draft" />

            {fieldError && !fieldError.field && (
              <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                              border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                              text-sm text-[--color-danger]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />{fieldError.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {products.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              )}
              <Button type="submit" loading={pending}>حفظ المنتج</Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" icon={<Plus size={16} />}
                  onClick={() => setShowForm(true)}>
            إضافة منتج آخر
          </Button>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-sand-200 px-5 py-4">
        <Button onClick={onNext} disabled={products.length === 0}
                icon={<ChevronLeft size={16} className="flip-rtl" />}>
          التالي
        </Button>
      </div>
    </Card>
  );
}
