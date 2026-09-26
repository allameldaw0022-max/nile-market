'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertTriangle, ImageOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Switch } from '@/components/ui/Field';
import { SingleImageUploader } from '@/components/dashboard/MediaUploader';
import {
  listLibrary, removeCategory, saveCategory,
  type CategoryRow, type LibraryAsset,
} from '@/lib/digital/dashboard';

/**
 * إدارة التصنيفات.
 *
 * ★★ أول إدارة حقيقية لها في المنصّة: كانت تُنشأ inline من نموذج
 * المنتج بالاسم وحده، بلا تعديل ولا حذف ولا صورة — و`categories.image_id`
 * موجودٌ في المخطّط ولم يُستعمل قطّ. فهذه الشاشة تستعمل العمود القائم
 * لا عمودًا جديدًا.
 *
 * ★ والحذف **ناعم**: الصفّ يبقى، ومنتجاته تُفكّ عنه ولا تُحذف. فتصنيفٌ
 * حُذف بالخطأ لا يأخذ معه كتالوج التاجر.
 *
 * ★ والصورة من مكتبة المنصّة (مشتركة، لا تُعدَّل ولا تُحمَّل على حصّة
 * التاجر) أو رفعٌ خاص بالمتجر — وكلتاهما تسكن `image_id` نفسه.
 */
export function CategoryManager({ storeId, categories, canEdit }: {
  storeId: string; categories: CategoryRow[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<CategoryRow> | null>(null);
  const [library, setLibrary] = useState<LibraryAsset[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const save = () => start(async () => {
    if (!draft?.name?.trim()) { setError('اسم التصنيف مطلوب'); return; }
    setError(null);
    const res = await saveCategory({
      storeId,
      name: draft.name,
      categoryId: draft.id ?? null,
      imageMediaId: draft.imageId ?? null,
      clearImage: draft.imageId === null && Boolean(draft.id),
      isActive: draft.isActive ?? true,
    });
    if (!res.ok) { setError(res.message); return; }
    setDraft(null); setLibrary(null);
    router.refresh();
  });

  return (
    <Card>
      <CardHeader title="تصنيفات المتجر"
                  description="التصنيف الفارغ لا يظهر للزبائن — ويبقى محفوظًا عندك."
                  action={canEdit
                    ? <Button size="sm" icon={<Plus size={14} />}
                              onClick={() => setDraft({ name: '', isActive: true })}>
                        تصنيف جديد
                      </Button>
                    : undefined} />
      <div className="space-y-3 p-5">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md border
                                     border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </p>
        )}

        {categories.length === 0 && !draft && (
          <p className="text-[12.5px] text-ink-500">لا تصنيفات بعد.</p>
        )}

        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-md border
                           border-ink-200 p-3">
              <span className="relative size-11 shrink-0 overflow-hidden rounded-md
                               bg-ink-100">
                {c.imageUrl ? (
                  <Image src={c.imageUrl} alt="" fill sizes="44px"
                         className="object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-ink-400">
                    <ImageOff size={16} aria-hidden />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold
                                 text-ink-900">
                  {c.name}
                  {!c.isActive && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]
                                     font-medium text-ink-500">مخفي</span>
                  )}
                  {c.productCount === 0 && (
                    <span className="rounded bg-gold-50 px-1.5 py-0.5 text-[11px]
                                     font-medium text-warning">
                      فارغ — لا يظهر للزبائن
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-ink-500 tabular">
                  {c.productCount} منتج · {c.slug}
                </span>
              </span>

              {canEdit && (
                <span className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline"
                          onClick={() => { setDraft(c); setLibrary(null); }}>
                    تعديل
                  </Button>
                  {confirming === c.id ? (
                    <>
                      <Button size="sm" variant="danger" loading={pending}
                              onClick={() => start(async () => {
                                const res = await removeCategory({
                                  storeId, categoryId: c.id,
                                });
                                setConfirming(null);
                                if (!res.ok) { setError(res.message); return; }
                                router.refresh();
                              })}>
                        أكّد الحذف
                      </Button>
                      <Button size="sm" variant="ghost"
                              onClick={() => setConfirming(null)}>إلغاء</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" icon={<Trash2 size={14} />}
                            onClick={() => setConfirming(c.id)}>حذف</Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>

        {confirming && (
          <p className="rounded-md bg-ink-50 p-3 text-[12.5px] text-ink-600">
            الحذف لا يمسّ منتجات التصنيف: تبقى في متجرك وتُفكّ عن التصنيف فقط.
          </p>
        )}

        {draft && (
          <div className="space-y-3 rounded-md border border-teal-300 bg-teal-50/40 p-4">
            <Input label="اسم التصنيف" required maxLength={80}
                   value={draft.name ?? ''}
                   onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />

            <div>
              <p className="text-[13px] font-bold text-ink-700">صورة التصنيف</p>
              <div className="mt-1.5 flex flex-wrap items-start gap-3">
                {/* رفع خاص بالمتجر — يمرّ بـ`prepare_upload` وحصّة الباقة */}
                <SingleImageUploader storeId={storeId} purpose="category_image"
                                     label="ارفع صورة"
                                     onUploaded={(mediaId) => setDraft(
                                       (d) => ({ ...d, imageId: mediaId }))} />
                {library === null ? (
                  <Button size="sm" variant="outline" loading={pending}
                          onClick={() => start(async () => {
                            const res = await listLibrary('category');
                            setLibrary(res.ok ? res.data : []);
                          })}>
                    اختر من مكتبة سوق النيل
                  </Button>
                ) : library.length === 0 ? (
                  <p className="text-[12px] text-ink-500">
                    المكتبة فارغة حاليًا — يمكنك ترك التصنيف بلا صورة.
                  </p>
                ) : (
                  <ul className="grid grid-cols-5 gap-2">
                    {library.map((a) => (
                      <li key={a.mediaFileId}>
                        <button type="button"
                                onClick={() => setDraft(
                                  (d) => ({ ...d, imageId: a.mediaFileId }))}
                                aria-pressed={draft.imageId === a.mediaFileId}
                                className={`relative block aspect-square w-full
                                            overflow-hidden rounded border-2 ${
                                  draft.imageId === a.mediaFileId
                                    ? 'border-teal-600' : 'border-ink-200'}`}>
                          <Image src={a.url} alt={a.label} fill sizes="72px"
                                 className="object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.imageId && (
                  <Button size="sm" variant="ghost"
                          onClick={() => setDraft((d) => ({ ...d, imageId: null }))}>
                    أزل الصورة
                  </Button>
                )}
              </div>
            </div>

            <Switch label="ظاهر للزبائن" checked={draft.isActive !== false}
                    onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />

            <div className="flex gap-2">
              <Button loading={pending} onClick={save}>حفظ التصنيف</Button>
              <Button variant="ghost"
                      onClick={() => { setDraft(null); setLibrary(null); }}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
