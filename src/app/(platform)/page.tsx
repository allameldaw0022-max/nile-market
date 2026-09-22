import Link from 'next/link';
import { ArrowLeft, BarChart3, Check, Globe, Package, ShieldCheck, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/money/format';

export const revalidate = 300;

const FEATURES = [
  { icon: Package,     title: 'إدارة كاملة للمنتجات',
    body: 'منتجات ومتغيرات ومخزون وتنبيهات نفاد — كل شيء من لوحة واحدة.' },
  { icon: Smartphone,  title: 'متجر سريع على الهاتف',
    body: 'مصمَّم ليفتح بسرعة على الشبكات الضعيفة، بالعربية وبواجهة RTL حقيقية.' },
  { icon: Globe,       title: 'رابط متجرك ودومينك',
    body: 'رابط فرعي مجاني لكل متجر، مع إمكانية ربط دومينك الخاص.' },
  { icon: ShieldCheck, title: 'أمان على مستوى قاعدة البيانات',
    body: 'بيانات متجرك معزولة فعليًا عن غيره، لا على مستوى الواجهة فقط.' },
  { icon: BarChart3,   title: 'إحصائيات تفهمها',
    body: 'مبيعاتك وطلباتك وعملاؤك وأكثر منتجاتك مبيعًا في مكان واحد.' },
  { icon: Check,       title: 'واتساب في صميم البيع',
    body: 'شارك منتجاتك واستقبل طلبات عملائك عبر واتساب مباشرة.' },
];

export default async function HomePage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from('plans')
    .select('id, code, name, description, price, is_free, price_configured_at')
    .eq('is_active', true).eq('is_public', true)
    .order('sort_order');

  return (
    <>
      <section className="bg-gradient-to-b from-nile-50 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30
                           bg-gold-400/10 px-3 py-1 text-xs font-bold text-gold-700">
            منصة سودانية
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight text-navy-900 sm:text-5xl">
            متجرك الإلكتروني
            <br className="sm:hidden" />
            <span className="text-nile-500"> جاهز خلال دقائق</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-sand-600 sm:text-lg">
            أنشئ متجرك، أضف منتجاتك، واستقبل طلبات عملائك — بالعربية،
            وبتجربة سريعة تناسب السوق السوداني.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg" icon={<ArrowLeft size={18} className="flip-rtl" />}>
                ابدأ مجانًا
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline">شاهد الباقات</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-extrabold text-navy-900">كل ما تحتاجه لتبيع</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <span className="grid size-10 place-items-center rounded-[--radius-md] bg-nile-50 text-nile-600">
                <f.icon size={20} />
              </span>
              <h3 className="mt-3 font-bold text-navy-900">{f.title}</h3>
              <p className="mt-1 text-sm text-sand-600">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-extrabold text-navy-900">الباقات</h2>
          <p className="mt-2 text-center text-sm text-sand-600">
            ابدأ بالباقة المجانية، وارقِ متى احتجت.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {(plans ?? []).map((p) => (
              <Card key={p.id}
                    className={p.code === 'basic' ? 'border-nile-500 p-5 ring-1 ring-nile-500' : 'p-5'}>
                <h3 className="font-extrabold text-navy-900">{p.name}</h3>
                <p className="mt-2 text-2xl font-extrabold text-nile-600 tabular">
                  {p.is_free
                    ? 'مجانًا'
                    : p.price_configured_at
                      ? <>{formatMoney(p.price)}<span className="text-sm font-medium text-sand-600"> / شهريًا</span></>
                      : <span className="text-base text-sand-600">قريبًا</span>}
                </p>
                {p.description && <p className="mt-2 text-sm text-sand-600">{p.description}</p>}
                <Link href="/signup" className="mt-5 block">
                  <Button className="w-full"
                          variant={p.code === 'basic' ? 'primary' : 'outline'}>
                    اختر {p.name}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-sand-600">
            الأسعار والحدود تُدار من لوحة الإدارة وتظهر هنا فور ضبطها.
          </p>
        </div>
      </section>
    </>
  );
}
