'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  AlertTriangle, Check, Info, LayoutTemplate, Plus, Sparkles, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Switch } from '@/components/ui/Field';
import {
  listLibrary, removeBanner, saveBanner, saveSections, seedStarter, switchTemplate,
  type BannerRow, type LibraryAsset,
} from '@/lib/digital/dashboard';

type Sections = Record<'hero' | 'promo' | 'categories' | 'featured' | 'offers', boolean>;

const SECTION_LABELS: { key: keyof Sections; label: string; hint: string }[] = [
  { key: 'hero',       label: 'اللافتة',           hint: 'البنر الرئيسي أعلى الصفحة.' },
  { key: 'promo',      label: 'البنر الترويجي',    hint: 'شريط عرض تحت اللافتة.' },
  { key: 'categories', label: 'التصنيفات',         hint: 'بطاقات التصنيفات بصورها.' },
  { key: 'featured',   label: 'الأكثر طلبًا',       hint: 'أحدث منتجاتك.' },
  { key: 'offers',     label: 'العروض',            hint: 'ما عليه خصم فعلي.' },
];

/**
 * إعدادات القالب.
 *
 * ★★ ترتيب الأقسام غير قابل للتغيير — وهذا معروضٌ للتاجر صريحًا لا
 * مخفيًّا: الترتيب مُصمَّم ليقود الزائر إلى الشراء، وتبديله يفسده.
 * وما يملكه التاجر إظهار القسم أو إخفاؤه ومحتواه.
 *
 * ★★ ولا «استعادة الافتراضي»: المحتوى الابتدائي يُزرع مرّة واحدة على
 * متجرٍ فارغ، والمحذوف لا يعود. وهذا مكتوبٌ للتاجر قبل أن يحذف.
 */
export function ThemeSettings({
  storeId, template, sections, banners, isEmpty, canEdit,
}: {
  storeId: string;
  template: 'classic' | 'digital';
  sections: Sections;
  banners: BannerRow[];
  /** المتجر خالٍ فعلًا (٠ منتجات و٠ تصنيفات) ⇒ يصحّ زرع المحتوى. */
  isEmpty: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [local, setLocal] = useState<Sections>(sections);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null); setNote(null);
      const res = await fn();
      if (!res.ok) { setError(res.message ?? 'تعذّر الحفظ'); return; }
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border
                                   border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
      {note && (
        <p role="status" className="flex items-start gap-2 rounded-md border
                                    border-success/30 bg-success-bg p-3 text-sm text-success">
          <Check size={16} className="mt-0.5 shrink-0" />{note}
        </p>
      )}

      {/* ═══ القالب ═══ */}
      <Card>
        <CardHeader title="قالب المتجر"
                    description="يحدّد شكل متجرك للزبائن. لا يُحذف ولا يُغيَّر أي
                                 منتج أو تصنيف أو طلب عند التبديل." />
        <div className="space-y-2.5 p-5">
          <TemplateOption
            on={template === 'classic'} disabled={!canEdit || pending}
            title="القالب العادي" icon={LayoutTemplate}
            body="متجر منتجات عام: شبكة منتجات، سلة، دفع عند الاستلام أو تحويل."
            onPick={() => run(() => switchTemplate({ storeId, template: 'classic' }))} />
          <TemplateOption
            on={template === 'digital'} disabled={!canEdit || pending}
            title="القالب الرقمي" icon={Sparkles}
            body="متجر منتجات رقمية: باقات لكل منتج، حقول شحن (رقم لاعب مثلًا)،
                  تنفيذ بعد تأكيد الدفع، ووضع ليلي للزبون."
            onPick={() => run(() => switchTemplate({ storeId, template: 'digital' }))} />

          {template === 'digital' && (
            <p className="flex items-start gap-2 rounded-md bg-ink-50 p-3
                          text-[12.5px] leading-relaxed text-ink-600">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
              يمكنك تجهيز متجرك بالكامل الآن. استقبال الطلبات يحتاج اشتراكًا
              مدفوعًا فعّالًا — وحتى ذلك الحين يتصفّح الزبائن متجرك ولا
              يستطيعون إنشاء طلب.
            </p>
          )}
        </div>
      </Card>

      {template === 'digital' && (
        <>
          {/* ═══ المحتوى الابتدائي ═══ */}
          <Card>
            <CardHeader title="المحتوى الابتدائي"
                        description="تصنيفات ومنتجات وباقات جاهزة لتبدأ منها." />
            <div className="space-y-3 p-5">
              <p className="flex items-start gap-2 rounded-md border border-gold-300
                            bg-gold-50 p-3 text-[12.5px] leading-relaxed text-ink-700">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                هذه بيانات ابتدائية للقالب، يمكنك تعديلها أو حذفها. لا يمكن
                استرجاع العناصر المحذوفة تلقائيًا.
              </p>
              {isEmpty ? (
                <Button loading={pending} disabled={!canEdit}
                        icon={<Plus size={15} />}
                        onClick={() => start(async () => {
                          setError(null);
                          const res = await seedStarter(storeId);
                          if (!res.ok) { setError(res.message); return; }
                          setNote(`أُضيف ${res.data.products} منتجًا و`
                            + `${res.data.categories} تصنيفًا.`);
                          router.refresh();
                        })}>
                  أضف المحتوى الابتدائي
                </Button>
              ) : (
                <p className="text-[12.5px] text-ink-500">
                  متجرك يحتوي بيانات بالفعل، فلا يُضاف محتوى ابتدائي فوقها.
                  أضف ما تريد من صفحة المنتجات والتصنيفات.
                </p>
              )}
            </div>
          </Card>

          {/* ═══ الأقسام ═══ */}
          <Card>
            <CardHeader title="أقسام الصفحة الرئيسية"
                        description="أظهر ما تحتاجه وأخفِ الباقي. الترتيب ثابت
                                     ومُصمَّم ليقود الزائر إلى الشراء." />
            <div className="space-y-2.5 p-5">
              {SECTION_LABELS.map(({ key, label, hint }) => (
                <Switch key={key} label={label} hint={hint}
                        checked={local[key]}
                        onChange={(v) => setLocal((s) => ({ ...s, [key]: v }))} />
              ))}
              <Button loading={pending} disabled={!canEdit}
                      onClick={() => run(() => saveSections({
                        storeId, sections: local,
                      }))}>
                حفظ الأقسام
              </Button>
            </div>
          </Card>

          {/* ═══ البنرات ═══ */}
          <BannerManager storeId={storeId} banners={banners} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}

function TemplateOption({ on, title, body, icon: Icon, onPick, disabled }: {
  on: boolean; title: string; body: string; icon: typeof Sparkles;
  onPick: () => void; disabled: boolean;
}) {
  return (
    <button type="button" onClick={onPick} disabled={disabled} aria-pressed={on}
            className={`flex w-full items-start gap-3 rounded-md border p-3.5 text-start
                        transition-colors disabled:opacity-60 ${
                          on ? 'border-teal-600 bg-teal-50'
                             : 'border-ink-200 hover:border-teal-300'}`}>
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-md ${
        on ? 'bg-teal-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
        <Icon size={17} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-bold text-ink-900">
          {title}
          {on && <Check size={14} className="text-teal-700" aria-hidden />}
          {on && <span className="sr-only">(المستعمل حاليًا)</span>}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{body}</span>
      </span>
    </button>
  );
}

function BannerManager({ storeId, banners, canEdit }: {
  storeId: string; banners: BannerRow[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryAsset[] | null>(null);
  const [draft, setDraft] = useState<Partial<BannerRow> | null>(null);

  const openNew = () => setDraft({
    slot: 'hero', title: '', description: '', ctaLabel: '', ctaHref: '',
    isVisible: true,
  });

  const loadLibrary = () => start(async () => {
    const res = await listLibrary('banner');
    setLibrary(res.ok ? res.data : []);
  });

  const save = () => start(async () => {
    if (!draft) return;
    setError(null);
    const res = await saveBanner({
      storeId,
      bannerId: draft.id ?? null,
      slot: draft.slot === 'promo' ? 'promo' : 'hero',
      mediaFileId: draft.mediaFileId ?? null,
      title: draft.title ?? undefined,
      description: draft.description ?? undefined,
      ctaLabel: draft.ctaLabel ?? undefined,
      ctaHref: draft.ctaHref ?? undefined,
      isVisible: draft.isVisible ?? true,
      sortOrder: draft.sortOrder,
    });
    if (!res.ok) { setError(res.message); return; }
    setDraft(null);
    router.refresh();
  });

  return (
    <Card>
      <CardHeader title="البنرات"
                  description="اللافتة والبنر الترويجي. رابط الزرّ يجب أن يكون
                               مسارًا داخلي أو https."
                  action={canEdit
                    ? <Button size="sm" variant="outline" icon={<Plus size={14} />}
                              onClick={openNew}>بنر جديد</Button>
                    : undefined} />
      <div className="space-y-3 p-5">
        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg
                                     p-3 text-sm text-danger">{error}</p>
        )}

        {banners.length === 0 && !draft && (
          <p className="text-[12.5px] text-ink-500">لا بنرات بعد.</p>
        )}

        <ul className="space-y-2">
          {banners.map((b) => (
            <li key={b.id}
                className="flex flex-wrap items-center justify-between gap-2
                           rounded-md border border-ink-200 p-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  {b.title || '(بلا عنوان)'}
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]
                                   font-medium text-ink-600">
                    {b.slot === 'hero' ? 'لافتة' : 'ترويجي'}
                  </span>
                  {!b.isVisible && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]
                                     text-ink-500">مخفي</span>
                  )}
                </span>
                {b.description && (
                  <span className="mt-0.5 block truncate text-xs text-ink-500">
                    {b.description}
                  </span>
                )}
              </span>
              {canEdit && (
                <span className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline"
                          onClick={() => setDraft(b)}>تعديل</Button>
                  <Button size="sm" variant="danger" icon={<Trash2 size={14} />}
                          loading={pending}
                          onClick={() => start(async () => {
                            const res = await removeBanner({
                              storeId, bannerId: b.id,
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
            <div className="flex gap-2">
              {(['hero', 'promo'] as const).map((slot) => (
                <Button key={slot} size="sm"
                        variant={draft.slot === slot ? 'primary' : 'outline'}
                        onClick={() => setDraft((d) => ({ ...d, slot }))}>
                  {slot === 'hero' ? 'لافتة' : 'ترويجي'}
                </Button>
              ))}
            </div>
            <Input label="العنوان" maxLength={80} value={draft.title ?? ''}
                   onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            <Input label="الوصف" maxLength={160} value={draft.description ?? ''}
                   onChange={(e) => setDraft(
                     (d) => ({ ...d, description: e.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="نص الزرّ" maxLength={40} value={draft.ctaLabel ?? ''}
                     onChange={(e) => setDraft(
                       (d) => ({ ...d, ctaLabel: e.target.value }))} />
              <Input label="رابط الزرّ" dir="ltr" maxLength={300}
                     placeholder="/products" value={draft.ctaHref ?? ''}
                     onChange={(e) => setDraft(
                       (d) => ({ ...d, ctaHref: e.target.value }))} />
            </div>

            <div>
              <p className="text-[13px] font-bold text-ink-700">صورة البنر</p>
              {library === null ? (
                <Button size="sm" variant="outline" className="mt-1.5"
                        loading={pending} onClick={loadLibrary}>
                  اختر من مكتبة سوق النيل
                </Button>
              ) : library.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-ink-500">
                  المكتبة فارغة حاليًا. يمكنك ترك البنر بلا صورة — يُرسَم
                  بخلفية بهوية سوق النيل.
                </p>
              ) : (
                <ul className="mt-1.5 grid grid-cols-4 gap-2">
                  {library.map((a) => (
                    <li key={a.mediaFileId}>
                      <button type="button"
                              onClick={() => setDraft(
                                (d) => ({ ...d, mediaFileId: a.mediaFileId }))}
                              aria-pressed={draft.mediaFileId === a.mediaFileId}
                              className={`relative block aspect-video w-full
                                          overflow-hidden rounded border-2 ${
                                draft.mediaFileId === a.mediaFileId
                                  ? 'border-teal-600' : 'border-ink-200'}`}>
                        <Image src={a.url} alt={a.label} fill sizes="120px"
                               className="object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Switch label="ظاهر للزبائن" checked={draft.isVisible !== false}
                    onChange={(v) => setDraft((d) => ({ ...d, isVisible: v }))} />

            <div className="flex gap-2">
              <Button loading={pending} onClick={save}>حفظ البنر</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>إلغاء</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
