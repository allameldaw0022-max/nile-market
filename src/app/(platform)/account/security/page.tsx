import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Monitor, ShieldCheck } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/money/format';
import { MfaSection } from './MfaSection';
import { SignOutAllButton } from './SignOutAllButton';

export const metadata: Metadata = { title: 'مركز الأمان' };

/** مركز الأمان — المواصفات §29. */
export default async function SecurityPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');

  const supabase = await createClient();
  const [{ data: sessions }, { data: factors }] = await Promise.all([
    // RLS: المستخدم يرى سجلاته هو فقط
    supabase.from('user_sessions_meta')
      .select('id, device_label, ip_hash, session_id, last_active_at, revoked_at')
      .order('last_active_at', { ascending: false }).limit(20),
    supabase.auth.mfa.listFactors(),
  ]);

  const totp = factors?.totp ?? [];
  const mfaEnabled = totp.some((f) => f.status === 'verified');
  const isAdmin = Boolean(actor.admin);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">مركز الأمان</h1>
        <p className="text-sm text-ink-500">إدارة حماية حسابك وجلساتك.</p>
      </div>

      <Card>
        <CardHeader title="الحساب" />
        <dl className="divide-y divide-ink-200 text-sm">
          <div className="flex items-center justify-between px-5 py-3">
            <dt className="text-ink-500">البريد الإلكتروني</dt>
            <dd className="font-bold text-ink-900" dir="ltr">{actor.email}</dd>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <dt className="text-ink-500">تأكيد البريد</dt>
            <dd>
              {actor.emailVerified
                ? <Badge tone="success">مؤكَّد</Badge>
                : <Badge tone="warning">غير مؤكَّد</Badge>}
            </dd>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <dt className="text-ink-500">حالة الحساب</dt>
            <dd>
              <Badge tone={actor.accountStatus === 'active' ? 'success' : 'danger'}>
                {actor.accountStatus === 'active' ? 'نشط'
                  : actor.accountStatus === 'suspended' ? 'موقوف' : 'مغلق'}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <dt className="text-ink-500">مستوى التحقق في هذه الجلسة</dt>
            <dd>
              <Badge tone={actor.aal === 'aal2' ? 'success' : 'neutral'}>
                {actor.aal === 'aal2' ? 'تحقق بخطوتين' : 'كلمة مرور'}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <MfaSection
        enabled={mfaEnabled}
        factorId={totp.find((f) => f.status === 'verified')?.id ?? null}
        adminLocked={isAdmin}
      />

      <Card>
        <CardHeader
          title="الأجهزة وعمليات الدخول الأخيرة"
          description="عنوان الشبكة يُخزَّن مجزَّأً ولا يُحفظ خامًا."
          action={<SignOutAllButton />}
        />
        {!sessions || sessions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">
            لا توجد عمليات دخول مسجّلة بعد.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <Monitor size={18} className="shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-900">
                    {s.device_label ?? 'جهاز غير معروف'}
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(s.last_active_at)}
                    {s.session_id && ` · ${
                      { password: 'كلمة مرور', oauth: 'حساب Google',
                        recovery: 'رابط استعادة', email_confirm: 'تأكيد بريد',
                      }[s.session_id] ?? s.session_id}`}
                  </p>
                </div>
                {s.revoked_at
                  ? <Badge tone="neutral">أُنهيت</Badge>
                  : <Badge tone="success">سارية</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-teal-700" size={20} />
          <p className="text-sm text-ink-500">
            لا نطلب كلمة مرورك عبر البريد أو واتساب أبدًا. إن وصلتك رسالة
            تطلبها فهي ليست منّا.
          </p>
        </div>
      </Card>
    </div>
  );
}
