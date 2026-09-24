import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Handshake } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { becomePartner } from '@/lib/partners/actions';
import { clearPartnerIntent, hasPartnerIntent } from '@/lib/partners/intent';
import { ErrorState } from '@/components/ui/States';
import { PartnerSignup } from '@/components/partner/PartnerSignup';
import { JoinConfirm } from '@/components/partner/JoinConfirm';

export const metadata: Metadata = {
  title: 'انضم كشريك — سوق النيل',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * بوابة الانضمام.
 *
 * ★ لا نظام مصادقة جديد: من ليس مسجَّلًا يرى نموذج التسجيل نفسه
 * (بريد أو Google). ومن عاد إلى هنا بعد التأكيد يُنشأ ملف شريكه
 * ويُحوَّل إلى لوحته.
 *
 * ★ الإنشاء فعل خادمي بهوية صاحب الجلسة — لا يُمرَّر معرّف حساب.
 */
export default async function PartnerJoinPage() {
  const actor = await getActor();

  if (actor.kind === 'user') {
    if (actor.partnerId) redirect('/partner');

    // ★ الإنشاء التلقائي لمن سجّل **من تدفق الشراكة** وحده: كوكي
    // النيّة يُكتب عند بدء التسجيل هنا. من وصل إلى الصفحة بطريق
    // آخر (تاجر نقر رابطًا مثلًا) يُسأل أولًا — لا يصير شريكًا بصمت.
    if (!(await hasPartnerIntent())) {
      return (
        <div className="mx-auto max-w-md px-4 py-14">
          <span className="mx-auto flex w-fit items-center gap-1.5 rounded-full
                           bg-gold-300/20 px-3 py-1 text-xs font-bold text-gold-700">
            <Handshake size={13} /> برنامج الشركاء
          </span>
          <h1 className="mt-4 text-center text-2xl font-extrabold text-ink-900">
            انضم كشريك
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-ink-600">
            سننشئ لك ملف شريك بحسابك الحالي، ويصلك رابط إحالة خاص بك.
            لن يتغيّر شيء في حسابك أو متاجرك.
          </p>
          <JoinConfirm />
          <p className="mt-6 text-center text-sm text-ink-500">
            <Link href="/partners" className="font-bold text-teal-700 hover:underline">
              اقرأ عن البرنامج أولًا
            </Link>
          </p>
        </div>
      );
    }

    const res = await becomePartner();
    if (!res.ok) {
      return (
        <div className="mx-auto max-w-md px-4 py-16">
          <ErrorState title="تعذّر إنشاء ملف الشريك" description={res.message} />
          <p className="mt-4 text-center text-sm text-ink-500">
            <Link href="/partners" className="font-bold text-teal-700 hover:underline">
              العودة إلى صفحة البرنامج
            </Link>
          </p>
        </div>
      );
    }
    await clearPartnerIntent();
    redirect('/partner');
  }

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-14">
      <span className="mx-auto inline-flex items-center gap-1.5 rounded-full
                       bg-gold-300/20 px-3 py-1 text-xs font-bold text-gold-700">
        <Handshake size={13} /> برنامج الشركاء
      </span>
      <h1 className="mt-4 text-center text-2xl font-extrabold text-ink-900">
        أنشئ حساب الشريك
      </h1>
      <p className="mt-1 text-center text-sm text-ink-500">
        خطوة واحدة، ثم يصلك رابط الإحالة الخاص بك.
      </p>

      <PartnerSignup />

      <p className="mt-6 text-center text-sm text-ink-500">
        لديك حساب؟{' '}
        <Link href="/login?next=/partner"
              className="font-bold text-teal-700 hover:underline">
          سجّل الدخول
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-ink-500">
        بإنشائك حسابًا فإنك توافق على{' '}
        <Link href="/legal/terms" className="underline">الشروط</Link> و
        <Link href="/legal/privacy" className="underline">سياسة الخصوصية</Link>.
      </p>
    </div>
  );
}
