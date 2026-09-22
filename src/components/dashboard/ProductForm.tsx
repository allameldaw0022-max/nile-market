'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Copy, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { UpgradeCard } from '@/components/ui/States';
import { ProductImagesUploader, type UploadedMedia } from '@/components/dashboard/MediaUploader';
import { PRODUCT_STATUS } from '@/lib/status';
import {
  createCategory, deleteProduct, duplicateProduct, saveProduct,
} from '@/app/(dashboard)/dashboard/products/actions';

export type ProductFormValues = {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  sku: string;
  categoryId: string;
  status: string;
  trackInventory: boolean;
  weightGrams: string;
  quantity: string;
  lowStockThreshold: string;
  images: UploadedMedia[];
};

export type CategoryOption = { id: string; name: string };

export function ProductForm({ storeId, initial, categories, canDelete }: {
  storeId: string;
  initial: ProductFormValues;
  categories: CategoryOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const isNew = initial.id === null;

  const [images, setImages] = useState<UploadedMedia[]>(initial.images);
  const [cats, setCats] = useState<CategoryOption[]>(categories);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    setLimit(null);
    formData.set('store_id', storeId);
    if (initial.id) formData.set('product_id', initial.id);
    formData.set('images_touched', '1');
    for (const media of images) formData.append('image_media_ids', media.mediaId);

    const res = await saveProduct(formData);
    if (!res.ok) {
      if (res.code === 'LIMIT_EXCEEDED') setLimit(res.message);
      else setError({ message: res.message, field: res.field });
      return;
    }
    router.push('/dashboard/products');
  });

  const addCategory = () => start(async () => {
    const res = await createCategory(storeId, newCategory);
    if (!res.ok) { setError({ message: res.message }); return; }
    setCats([...cats, res.data]);
    setNewCategory('');
  });

  const onDuplicate = () => start(async () => {
    if (!initial.id) return;
    const res = await duplicateProduct(storeId, initial.id);
    if (!res.ok) {
      if (res.code === 'LIMIT_EXCEEDED') setLimit(res.message);
      else setError({ message: res.message });
      return;
    }
    router.push(`/dashboard/products/${res.data.id}/edit`);
  });

  const onDelete = () => start(async () => {
    if (!initial.id) return;
    const res = await deleteProduct(storeId, initial.id);
    if (!res.ok) { setError({ message: res.message }); return; }
    router.push('/dashboard/products');
  });

  const fieldError = (name: string) =>
    error?.field === name ? error.message : undefined;

  return (
    <form action={submit} className="space-y-5">
      {limit && <UpgradeCard message={limit} />}

      {error && !error.field && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
        </div>
      )}

      <Card>
        <CardHeader title="البيانات الأساسية" />
        <div className="space-y-4 p-5">
          <Input name="name" label="اسم المنتج" required maxLength={200}
                 defaultValue={initial.name} error={fieldError('name')} />
          <Textarea name="description" label="الوصف" defaultValue={initial.description}
                    hint="المقاسات والألوان والمواصفات — يظهر في صفحة المنتج." />
          <Input name="slug" label="رابط المنتج" dir="ltr" defaultValue={initial.slug}
                 hint="يُولَّد من الاسم إن تُرك فارغًا." />
        </div>
      </Card>

      <Card>
        <CardHeader title="السعر" description="بالجنيه السوداني." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Input name="price" label="سعر البيع" required type="number" min={0} step="0.01"
                 inputMode="decimal" dir="ltr" defaultValue={initial.price}
                 error={fieldError('price')} />
          <Input name="compare_at_price" label="السعر قبل الخصم" type="number" min={0}
                 step="0.01" inputMode="decimal" dir="ltr"
                 defaultValue={initial.compareAtPrice}
                 hint="أعلى من سعر البيع — يظهر مشطوبًا." />
          <Input name="cost_price" label="سعر التكلفة" type="number" min={0} step="0.01"
                 inputMode="decimal" dir="ltr" defaultValue={initial.costPrice}
                 hint="لا يظهر للزبائن إطلاقًا." />
        </div>
      </Card>

      <Card>
        <CardHeader title="المخزون والتصنيف" />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="sku" label="رمز المنتج (SKU)" dir="ltr"
                   defaultValue={initial.sku} hint="فريد داخل متجرك." />
            <Select name="category_id" label="التصنيف" defaultValue={initial.categoryId}>
              <option value="">بلا تصنيف</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Input label="تصنيف جديد" value={newCategory} className="flex-1"
                   placeholder="مثال: أحزمة"
                   onChange={(e) => setNewCategory(e.target.value)} />
            <Button type="button" variant="outline" loading={pending}
                    disabled={newCategory.trim().length < 2} onClick={addCategory}>
              إضافة
            </Button>
          </div>

          <Switch name="track_inventory" label="تتبّع المخزون"
                  hint="عند إيقافه يبقى المنتج متاحًا للشراء دائمًا."
                  defaultChecked={initial.trackInventory} />

          <div className="grid gap-4 sm:grid-cols-3">
            {isNew ? (
              <Input name="quantity" label="الكمية الابتدائية" type="number" min={0} step="1"
                     inputMode="numeric" dir="ltr" defaultValue={initial.quantity} />
            ) : (
              <Input label="الكمية الحالية" dir="ltr" value={initial.quantity} readOnly
                     disabled hint="التعديل من صفحة المخزون ليُسجَّل كحركة." />
            )}
            <Input name="low_stock_threshold" label="حد التنبيه" type="number" min={0}
                   step="1" inputMode="numeric" dir="ltr"
                   defaultValue={initial.lowStockThreshold}
                   hint="ننبّهك عند هبوط المخزون إليه." />
            <Input name="weight_grams" label="الوزن (جرام)" type="number" min={0} step="1"
                   inputMode="numeric" dir="ltr" defaultValue={initial.weightGrams} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="الصور" description="الأولى هي صورة الغلاف." />
        <div className="p-5">
          <ProductImagesUploader storeId={storeId} value={images} onChange={setImages} />
        </div>
      </Card>

      <Card>
        <CardHeader title="النشر" />
        <div className="p-5">
          <Select name="status" label="حالة المنتج" defaultValue={initial.status}
                  hint="المسودة لا تظهر في المتجر.">
            {Object.entries(PRODUCT_STATUS).map(([value, s]) => (
              <option key={value} value={value}>{s.label}</option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" loading={pending} icon={<Save size={16} />}>
          {isNew ? 'إضافة المنتج' : 'حفظ التغييرات'}
        </Button>
        <Link href="/dashboard/products">
          <Button type="button" variant="ghost">إلغاء</Button>
        </Link>

        {!isNew && (
          <div className="ms-auto flex items-center gap-2">
            <Button type="button" variant="outline" icon={<Copy size={15} />}
                    loading={pending} onClick={onDuplicate}>
              نسخ
            </Button>
            {canDelete && (
              <Button type="button" variant="danger" icon={<Trash2 size={15} />}
                      loading={pending}
                      onClick={() => {
                        if (confirm('حذف هذا المنتج؟ سيُزال من متجرك، وتبقى الطلبات السابقة كما هي.'))
                          onDelete();
                      }}>
                حذف
              </Button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
