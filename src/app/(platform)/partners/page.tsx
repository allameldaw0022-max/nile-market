import Link from 'next/link';
import type { Metadata } from 'next';
import {
  BarChart3, Check, Handshake, Link2, RefreshCw, Wallet,
} from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { createPublicClient } from '@/lib/supabase/public';
import { rpc } from '@/lib/supabase/rpc';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: 'كن شريكاً — سوق النيل',
  description:
    'سوّق سوق النيل واحصل على عمولة دائمة مع كل اشتراك وتجديد للمتاجر التي تأتي من رابطك.',
  alternates: { canonical: '/partners' },
};

/**
 * صفحة برنامج الشركاء العامة.
 *
 * ★ النسبة تُقرأ من إعدادات المنصة لا تُكتب في النص: موضع واحد
 * للرقم في النظام كلّه، فلا تختلف الصفحة عن العقد.
 */
export default async function PartnersLandingPage() {
  const [actor, rate] = await Promise.all([getActor(), defaultRate()]);
  const signedIn = actor.kind === 'user';
  const isPartner = signedIn && Boolean(actor.partnerId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <span className="inline-flex items-center gap-1.5 rounded-full
                       bg-gold-300/20 px-3 py-1 text-xs font-bold text-gold-700">
        <Handshake size={13} /> برنامج شركاء {config.siteName}
      </span>

      <h1 className="mt-4 text-2xl font-extrabold leading-tight text-ink-900
                     sm:text-3xl">
        سوّق واحصل على عمولة دائمة مع كل اشتراك وتجديد.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
        كل متجر يأتي من خلال رابطك يبقى مرتبطاً بك، وتحصل على عمولتك عند
        كل دفعة اشتراك مؤكدة وفق نظام المنصة.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {isPartner ? (
          <Link href="/partner">
            <Button size="lg">افتح لوحة الشريك</Button>
          </Link>
        ) : (
          <Link href="/partners/join">
            <Button size="lg">كن شريكاً</Button>
          </Link>
        )}
        <Link href="/pricing">
          <Button size="lg" variant="outline">شاهد الباقات</Button>
        </Link>
      </div>

      <Card className="mt-8 p-5">
        <p className="text-sm text-ink-500">نسبة العمولة</p>
        <p className="mt-1 text-4xl font-extrabold tabular text-teal-700">
          {rate}%
        </p>
        <p className="mt-1 text-sm text-ink-600">
          من قيمة كل اشتراك مؤكد — وكل تجديد بعده، لكل الباقات.
        </p>
      </Card>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        <Benefit icon={<RefreshCw size={16} />} title="عمولة مستمرة"
                 body="ليست مرة واحدة: كل تجديد للتاجر يُنشئ عمولة جديدة." />
        <Benefit icon={<Link2 size={16} />} title="رابط إحالة خاص"
                 body="رابط قصير وثابت باسمك، تشاركه أينما شئت." />
        <Benefit icon={<BarChart3 size={16} />} title="لوحة تحكم للشريك"
                 body="متاجرك واشتراكاتها وعمولاتك، بأرقام حقيقية لحظة بلحظة." />
        <Benefit icon={<Wallet size={16} />} title="طلب صرف الأرباح"
                 body="تضيف بيانات حسابك وتطلب الصرف، ونحوّل لك يدوياً." />
      </ul>

      <section className="mt-10">
        <h2 className="font-extrabold text-ink-900">كيف يعمل؟</h2>
        <ol className="mt-3 space-y-3">
          {[
            'سجّل بالبريد أو بحساب Google — ويُنشأ ملف الشريك تلقائياً.',
            'انسخ رابط الإحالة الخاص بك وشاركه.',
            'التاجر يسجّل من رابطك ويبقى مرتبطاً بك.',
            `عند كل دفعة اشتراك مؤكدة تُقيَّد لك عمولة ${rate}%.`,
            'تتابع أرباحك في لوحتك وتطلب صرفها متى بلغت رصيداً مستحقاً.',
          ].map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full
                               bg-teal-600 text-xs font-extrabold text-white tabular">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-ink-700">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 rounded-md border border-ink-200 bg-ink-50 p-4
                    text-xs leading-relaxed text-ink-600">
        لا تُحتسب عمولة على إنشاء حساب ولا على تسجيل متجر ولا على طلب
        اشتراك قيد المراجعة — فقط عند تأكيد الدفع. وإذا استُرد اشتراك
        سبق أن أنشأ عمولة، يُقيَّد عكسها في سجلك.
      </p>

      {!signedIn && (
        <p className="mt-6 text-center text-sm text-ink-500">
          لديك حساب؟{' '}
          <Link href="/login?next=/partner"
                className="font-bold text-teal-700 hover:underline">
            سجّل الدخول
          </Link>
        </p>
      )}
    </div>
  );
}

function Benefit({ icon, title, body }: {
  icon: React.ReactNode; title: string; body: string;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-ink-200 bg-white p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-md
                       bg-teal-50 text-teal-700">{icon}</span>
      <span>
        <span className="flex items-center gap-1 font-bold text-ink-900">
          <Check size={13} className="text-success" />{title}
        </span>
        <span className="mt-0.5 block text-sm text-ink-600">{body}</span>
      </span>
    </li>
  );
}

/** النسبة المعلنة = النسبة التي يحصل عليها شريك جديد فعلاً. */
async function defaultRate(): Promise<number> {
  try {
    const supabase = createPublicClient();
    const { data } = await rpc(supabase, 'platform_default_partner_rate', {});
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? n : 30;
  } catch {
    return 30;
  }
}
