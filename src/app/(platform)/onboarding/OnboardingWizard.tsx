'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, CreditCard,
  Image as ImageIcon, MessageCircle, Package, Rocket, Store, Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Field';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { useAutosave, type SaveState } from '@/lib/use-autosave';
import { checkSlug, createStore, publishStore, saveStoreStep } from './actions';
import { StoreLogoUploader } from '@/components/dashboard/MediaUploader';
import { FirstProductStep } from './FirstProductStep';
import { DeliveryZonesStep } from './DeliveryZonesStep';

export type WizardInitial = {
  storeId: string; name: string; slug: string; businessType: string;
  description: string; logoUrl: string | null; step: string;
  whatsapp: string; contactPhone: string;
  codEnabled: boolean; bankTransferEnabled: boolean; bankakEnabled: boolean;
  productCount: number; zoneCount: number;
};

const STEPS = [
  { key: 'store-info', label: 'معلومات المتجر', icon: Store },
  { key: 'logo',       label: 'الشعار',         icon: ImageIcon },
  { key: 'whatsapp',   label: 'واتساب',         icon: MessageCircle },
  { key: 'product',    label: 'أول منتج',       icon: Package },
  { key: 'delivery',   label: 'التوصيل',        icon: Truck },
  { key: 'payment',    label: 'الدفع',          icon: CreditCard },
  { key: 'publish',    label: 'المعاينة والنشر', icon: Rocket },
] as const;

const BUSINESS_TYPES = [
  'ملابس وأزياء', 'إلكترونيات', 'مستحضرات تجميل', 'أغذية ومشروبات',
  'أثاث ومنزل', 'كتب وقرطاسية', 'رياضة', 'هدايا', 'أخرى',
];

export function OnboardingWizard({ initial }: { initial: WizardInitial | null }) {
  const router = useRouter();
  const [store, setStore] = useState<WizardInitial | null>(initial);
  const stepIndex = useMemo(() => {
    const i = STEPS.findIndex((s) => s.key === (store?.step ?? 'store-info'));
    return i === -1 ? 0 : i;
  }, [store?.step]);

  if (!store) return <CreateStoreStep onCreated={setStore} />;

  const current = STEPS[stepIndex];
  const goto = (key: string) => setStore({ ...store, step: key });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-extrabold text-navy-900">إنشاء متجرك</h1>
      <p className="text-sm text-sand-600">
        تقدّمك محفوظ تلقائيًا — يمكنك المتابعة في أي وقت.
      </p>

      <ol className="mt-6 flex gap-1 overflow-x-auto no-scrollbar pb-1">
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => goto(s.key)}
                aria-current={active ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5
                            text-xs font-bold transition-colors ${
                  active ? 'border-nile-500 bg-nile-500 text-white'
                  : done ? 'border-[--color-success]/40 bg-[--color-success-bg] text-[--color-success]'
                  : 'border-sand-300 bg-white text-sand-600'}`}
              >
                {done ? <Check size={13} /> : <s.icon size={13} />}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        {current.key === 'store-info' && <StoreInfoStep store={store} setStore={setStore} onNext={() => goto('logo')} />}
        {current.key === 'logo'       && <LogoStep store={store} setStore={setStore} onNext={() => goto('whatsapp')} />}
        {current.key === 'whatsapp'   && <WhatsappStep store={store} setStore={setStore} onNext={() => goto('product')} />}
        {current.key === 'product'    && <FirstProductStep storeId={store.storeId} count={store.productCount}
                                             onChange={(n) => setStore({ ...store, productCount: n })}
                                             onNext={() => goto('delivery')} />}
        {current.key === 'delivery'   && <DeliveryZonesStep storeId={store.storeId} count={store.zoneCount}
                                             onChange={(n) => setStore({ ...store, zoneCount: n })}
                                             onNext={() => goto('payment')} />}
        {current.key === 'payment'    && <PaymentStep store={store} setStore={setStore} onNext={() => goto('publish')} />}
        {current.key === 'publish'    && <PublishStep store={store} onDone={() => router.push('/dashboard')} />}
      </div>
    </div>
  );
}

// ── الخطوة 0: إنشاء المتجر ──────────────────────────────────────────
function CreateStoreStep({ onCreated }: { onCreated: (s: WizardInitial) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const autoSlug = (v: string) =>
    v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 48);

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-extrabold text-navy-900">أنشئ متجرك</h1>
      <p className="mt-1 text-sm text-sand-600">اسم المتجر ورابطه — يمكنك تعديلهما لاحقًا.</p>

      <form
        className="mt-8 space-y-4"
        action={(fd) => start(async () => {
          setError(null);
          const res = await createStore(fd);
          if (!res.ok) { setError(res.message); return; }
          onCreated({
            storeId: res.data.storeId, name, slug: slug || autoSlug(name),
            businessType, description: '', logoUrl: null, step: 'logo',
            whatsapp: '', contactPhone: '', codEnabled: false,
            bankTransferEnabled: true, bankakEnabled: false,
            productCount: 0, zoneCount: 0,
          });
        })}
      >
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                          border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                          text-sm text-[--color-danger]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        <Input name="name" label="اسم المتجر" required value={name}
               onChange={(e) => {
                 setName(e.target.value);
                 if (!slug) setSlugState('idle');
               }} />

        <div>
          <Input
            name="slug" label="رابط المتجر" required dir="ltr"
            value={slug || autoSlug(name)}
            onChange={(e) => { setSlug(autoSlug(e.target.value)); setSlugState('idle'); }}
            onBlur={() => start(async () => {
              const value = slug || autoSlug(name);
              if (value.length < 3) return;
              setSlugState('checking');
              const res = await checkSlug(value);
              setSlugState(res.ok ? (res.data.available ? 'free' : 'taken') : 'taken');
            })}
            hint={`سيكون متجرك على: ${slug || autoSlug(name) || 'اسم-متجرك'}.nilemarket.online`}
            error={slugState === 'taken' ? 'هذا الرابط محجوز — اختر غيره' : undefined}
          />
          {slugState === 'free' && (
            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[--color-success]">
              <Check size={13} /> الرابط متاح
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bt" className="block text-[13px] font-bold text-navy-700">نوع النشاط</label>
          <select id="bt" name="business_type" value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="h-11 w-full rounded-[--radius-md] border border-[--color-field-border] bg-white
                             px-3 text-[15px] text-navy-900 focus:border-nile-500">
            <option value="">اختر نوع النشاط</option>
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={pending}
                disabled={slugState === 'taken'}>
          إنشاء المتجر
        </Button>
      </form>
    </div>
  );
}

// ── خطوات مبنية على الحفظ التلقائي ─────────────────────────────────
type StepProps = {
  store: WizardInitial;
  setStore: (s: WizardInitial) => void;
  onNext: () => void;
};

function useStepSave(store: WizardInitial, step: string) {
  return useAutosave({
    draftKey: `nm_onboarding_${store.storeId}_${step}`,
    values: store as unknown as Record<string, unknown>,
    save: async (v) => {
      const s = v as unknown as WizardInitial;
      const res = await saveStoreStep(store.storeId, step,
        { name: s.name, business_type: s.businessType || null, description: s.description || null },
        {
          whatsapp_number: s.whatsapp || null,
          contact_phone: s.contactPhone || null,
          cod_enabled: s.codEnabled,
          bank_transfer_enabled: s.bankTransferEnabled,
          bankak_enabled: s.bankakEnabled,
        });
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    },
  });
}

function StepShell({ title, description, children, footer, saveState }: {
  title: string; description?: string; children: React.ReactNode;
  footer: React.ReactNode; saveState: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-sand-200 px-5 py-4">
        <div>
          <h2 className="font-bold text-navy-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-sand-600">{description}</p>}
        </div>
        {saveState}
      </div>
      <div className="space-y-4 p-5">{children}</div>
      <div className="flex items-center justify-end gap-2 border-t border-sand-200 px-5 py-4">
        {footer}
      </div>
    </Card>
  );
}

function StoreInfoStep({ store, setStore, onNext }: StepProps) {
  const { state, error, markDirty, saveNow } = useStepSave(store, 'store-info');
  return (
    <StepShell
      title="معلومات المتجر"
      description="هذه البيانات تظهر للزبائن في متجرك."
      saveState={<SaveIndicator state={state} error={error} />}
      footer={
        <Button onClick={async () => { await saveNow(); onNext(); }}
                icon={<ChevronLeft size={16} className="flip-rtl" />}>
          التالي
        </Button>
      }
    >
      <Input label="اسم المتجر" value={store.name} required
             onChange={(e) => { setStore({ ...store, name: e.target.value }); markDirty(); }} />
      <div className="space-y-1.5">
        <label htmlFor="bt2" className="block text-[13px] font-bold text-navy-700">نوع النشاط</label>
        <select id="bt2" value={store.businessType}
                onChange={(e) => { setStore({ ...store, businessType: e.target.value }); markDirty(); }}
                className="h-11 w-full rounded-[--radius-md] border border-[--color-field-border] bg-white
                           px-3 text-[15px] text-navy-900 focus:border-nile-500">
          <option value="">اختر نوع النشاط</option>
          {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <Textarea label="وصف المتجر" value={store.description}
                hint="سطران يشرحان ما تبيعه — يظهران في نتائج البحث."
                onChange={(e) => { setStore({ ...store, description: e.target.value }); markDirty(); }} />
    </StepShell>
  );
}

function LogoStep({ store, setStore, onNext }: StepProps) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  // الشعار يُحفظ لحظة انتهاء الرفع لا بعد فترة انتظار: النشر يتحقق من
  // `stores.logo_url` في القاعدة، فحالة محلية وحدها تجعل الخطوة تكذب.
  const persist = async (url: string) => {
    setState('saving');
    setError(null);
    const res = await saveStoreStep(store.storeId, 'logo', { logo_url: url });
    if (!res.ok) {
      setError(res.message);
      setState('error');
      return;
    }
    setStore({ ...store, logoUrl: url });
    setState('saved');
  };

  return (
    <StepShell
      title="شعار المتجر"
      description="صورة مربعة بخلفية واضحة. الحد الأقصى 5 ميجابايت."
      saveState={<SaveIndicator state={state} error={error} />}
      footer={
        <>
          <Button variant="ghost" onClick={onNext}>لاحقًا</Button>
          <Button onClick={onNext} disabled={!store.logoUrl || state === 'saving'}
                  icon={<ChevronLeft size={16} className="flip-rtl" />}>
            التالي
          </Button>
        </>
      }
    >
      <StoreLogoUploader
        storeId={store.storeId}
        currentUrl={store.logoUrl}
        onUploaded={(url) => { void persist(url); }}
      />
    </StepShell>
  );
}

function WhatsappStep({ store, setStore, onNext }: StepProps) {
  const { state, error, markDirty, saveNow } = useStepSave(store, 'whatsapp');
  return (
    <StepShell
      title="رقم واتساب"
      description="سيظهر زر واتساب في متجرك ليتواصل الزبائن معك مباشرة."
      saveState={<SaveIndicator state={state} error={error} />}
      footer={
        <Button onClick={async () => { await saveNow(); onNext(); }}
                disabled={store.whatsapp.replace(/\D/g, '').length < 9}
                icon={<ChevronLeft size={16} className="flip-rtl" />}>
          التالي
        </Button>
      }
    >
      <Input label="رقم واتساب" required dir="ltr" type="tel" value={store.whatsapp}
             placeholder="249912345678"
             hint="بصيغة دولية بدون + أو أصفار بادئة (مثال: 249912345678)"
             onChange={(e) => { setStore({ ...store, whatsapp: e.target.value }); markDirty(); }} />
      <Input label="رقم للتواصل (اختياري)" dir="ltr" type="tel" value={store.contactPhone}
             onChange={(e) => { setStore({ ...store, contactPhone: e.target.value }); markDirty(); }} />
    </StepShell>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[--radius-md]
                      border border-sand-200 p-3.5 hover:border-nile-300">
      <input type="checkbox" checked={checked} className="mt-1 size-4 accent-[--color-nile-500]"
             onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-bold text-navy-900">{label}</span>
        <span className="block text-xs text-sand-600">{hint}</span>
      </span>
    </label>
  );
}

function PaymentStep({ store, setStore, onNext }: StepProps) {
  const { state, error, markDirty, saveNow } = useStepSave(store, 'payment');
  const none = !store.codEnabled && !store.bankTransferEnabled && !store.bankakEnabled;

  const set = (patch: Partial<WizardInitial>) => {
    setStore({ ...store, ...patch });
    markDirty();
  };

  return (
    <StepShell
      title="طرق الدفع"
      description="في الإصدار الأول: تحويل بنكي · بنكك · الدفع عند الاستلام."
      saveState={<SaveIndicator state={state} error={error} />}
      footer={
        <Button onClick={async () => { await saveNow(); onNext(); }} disabled={none}
                icon={<ChevronLeft size={16} className="flip-rtl" />}>
          التالي
        </Button>
      }
    >
      <Toggle label="الدفع عند الاستلام" hint="الزبون يدفع نقدًا عند وصول الطلب."
              checked={store.codEnabled}
              onChange={(v) => set({ codEnabled: v })} />
      <Toggle label="التحويل البنكي" hint="الزبون يحوّل ويرفع إثبات التحويل."
              checked={store.bankTransferEnabled}
              onChange={(v) => set({ bankTransferEnabled: v })} />
      <Toggle label="بنكك" hint="تحويل عبر بنكك بإثبات يدوي — لا يوجد تكامل آلي."
              checked={store.bankakEnabled}
              onChange={(v) => set({ bankakEnabled: v })} />
      {none && (
        <p className="text-sm text-[--color-danger]">اختر طريقة دفع واحدة على الأقل.</p>
      )}
    </StepShell>
  );
}

function PublishStep({ store, onDone }: { store: WizardInitial; onDone: () => void }) {
  const [result, setResult] = useState<{ published: boolean; missing: string[]; host: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (result?.published) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto text-[--color-success]" size={40} />
        <h2 className="mt-3 text-lg font-extrabold text-navy-900">متجرك منشور الآن</h2>
        {result.host && (
          <a href={`https://${result.host}`} target="_blank" rel="noopener noreferrer"
             dir="ltr" className="mt-2 block break-all text-sm font-bold text-nile-600 hover:underline">
            {result.host}
          </a>
        )}
        <Button className="mt-6" onClick={onDone}>الانتقال إلى لوحة التحكم</Button>
      </Card>
    );
  }

  return (
    <StepShell
      title="المعاينة والنشر"
      description="راجع البيانات ثم انشر متجرك ليصبح متاحًا للزبائن."
      saveState={null}
      footer={
        <Button size="lg" icon={<Rocket size={16} />} loading={pending}
                onClick={() => start(async () => {
                  setError(null);
                  const res = await publishStore(store.storeId);
                  if (!res.ok) { setError(res.message); return; }
                  setResult(res.data);
                })}>
          نشر المتجر
        </Button>
      }
    >
      <dl className="divide-y divide-sand-200 text-sm">
        <Row label="اسم المتجر" value={store.name} />
        <Row label="الرابط" value={`${store.slug}.nilemarket.online`} ltr />
        <Row label="نوع النشاط" value={store.businessType || '—'} />
        <Row label="الشعار" value={store.logoUrl ? 'مرفوع' : 'غير مرفوع'} />
        <Row label="واتساب" value={store.whatsapp || '—'} ltr />
        <Row label="المنتجات" value={`${store.productCount}`} />
        <Row label="مناطق التوصيل" value={`${store.zoneCount}`} />
      </dl>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {result && !result.published && result.missing.length > 0 && (
        <div className="rounded-[--radius-md] border border-gold-500/40 bg-gold-400/10 p-4">
          <p className="text-sm font-bold text-navy-900">ينقص متجرك قبل النشر:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-navy-700">
            {result.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
    </StepShell>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sand-600">{label}</dt>
      <dd className="font-bold text-navy-900" dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  );
}
