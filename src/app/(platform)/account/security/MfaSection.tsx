'use client';
import { useActionState, useState, useTransition } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle2, KeyRound, Lock } from 'lucide-react';
import {
  disableMfa, startMfaEnrollment, verifyMfaChallenge, verifyMfaEnrollment,
  type AuthResult, type MfaEnrollState,
} from '../../(auth)/actions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';

/**
 * ★★ «رفع الجلسة» ليس زينة — بدونه القسم مقفل.
 *
 * تفعيل التحقق يرفع الجلسة التي فعّلته إلى aal2. لكن أول تسجيل خروج
 * يُنزل الجلسة التالية إلى aal1، ولم يكن في المنتج أي مكان يُدخل فيه
 * الرمز لرفعها ثانيةً: `verifyMfaChallenge` كانت مكتوبة وغير مستعملة
 * في أي ملف. وحارس اللوحة يشترط aal2، و`disableMfa` يرفض الإلغاء عن
 * حساب إدارة — فالمالك يُحبس خارج لوحته بلا مخرج داخل المنتج.
 */
export function MfaSection({ enabled, factorId, adminLocked, currentAal }: {
  enabled: boolean; factorId: string | null; adminLocked: boolean;
  currentAal: 'aal1' | 'aal2';
}) {
  const [enroll, setEnroll] = useState<MfaEnrollState | null>(null);
  const [starting, startEnroll] = useTransition();
  const [verifyState, verifyAction, verifying] =
    useActionState<AuthResult | null, FormData>(verifyMfaEnrollment, null);
  const [disableState, disableAction, disabling] =
    useActionState<AuthResult | null, FormData>(disableMfa, null);
  const [stepUpState, stepUpAction, steppingUp] =
    useActionState<AuthResult | null, FormData>(verifyMfaChallenge, null);

  const active = enabled && !verifyState?.ok ? true : enabled || Boolean(verifyState?.ok);

  return (
    <Card>
      <CardHeader
        title="التحقق بخطوتين (TOTP)"
        description="طبقة حماية إضافية عبر تطبيق مثل Google Authenticator."
        action={active ? <Badge tone="success">مفعّل</Badge> : <Badge tone="warning">غير مفعّل</Badge>}
      />

      <div className="space-y-4 p-5">
        {adminLocked && (
          <div className="flex items-start gap-2 rounded-md border border-teal-200
                          bg-teal-50 p-3 text-sm text-ink-700">
            <Lock size={16} className="mt-0.5 shrink-0 text-teal-700" />
            التحقق بخطوتين <b>إلزامي</b> لحسابات الإدارة، ولا يمكن إلغاؤه.
            بدونه لن تستطيع الوصول إلى لوحة الإدارة.
          </div>
        )}

        {active ? (
          <>
            <p className="text-sm text-ink-500">
              حسابك محمي بالتحقق بخطوتين. ستحتاج رمز التطبيق عند الدخول
              إلى الأقسام الحساسة.
            </p>

            {enabled && currentAal !== 'aal2' && (
              <form action={stepUpAction}
                    className="space-y-3 rounded-md border border-teal-200
                               bg-teal-50 p-4">
                <p className="text-sm font-bold text-ink-900">
                  ارفع هذه الجلسة إلى تحقّق بخطوتين
                </p>
                <p className="text-sm text-ink-700">
                  دخلت بكلمة المرور وحدها. أدخل رمز التطبيق لتفتح الأقسام
                  الحسّاسة — ومنها لوحة الإدارة.
                </p>
                {stepUpState && !stepUpState.ok && (
                  <p role="alert" className="text-sm text-danger">{stepUpState.message}</p>
                )}
                <Input name="code" label="رمز التحقق" required inputMode="numeric"
                       maxLength={6} dir="ltr" placeholder="000000"
                       autoComplete="one-time-code" />
                <Button type="submit" size="sm" loading={steppingUp}>تأكيد</Button>
              </form>
            )}
            {!adminLocked && factorId && (
              <form action={disableAction}>
                <input type="hidden" name="factor_id" value={factorId} />
                {disableState && !disableState.ok && (
                  <p role="alert" className="mb-2 text-sm text-danger">
                    {disableState.message}
                  </p>
                )}
                <Button type="submit" variant="outline" size="sm" loading={disabling}>
                  إلغاء التحقق بخطوتين
                </Button>
              </form>
            )}
          </>
        ) : enroll?.ok ? (
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="factor_id" value={enroll.factorId} />
            <p className="text-sm text-ink-500">
              1) امسح الرمز بتطبيق المصادقة. 2) أدخل الرمز المكوّن من 6 أرقام.
            </p>
            <div className="flex flex-col items-center gap-3 rounded-md
                            border border-ink-200 bg-ink-50 p-4">
              {/* QR يأتي كـdata:image/svg من Supabase */}
              <Image src={enroll.qr} alt="رمز QR للتحقق بخطوتين"
                     width={180} height={180} unoptimized className="rounded bg-white p-2" />
              <div className="text-center">
                <p className="text-xs text-ink-500">أو أدخل السر يدويًا:</p>
                <code dir="ltr" className="mt-1 block break-all text-xs font-bold text-ink-900">
                  {enroll.secret}
                </code>
              </div>
            </div>
            {verifyState && !verifyState.ok && (
              <div role="alert" className="flex items-start gap-2 rounded-md border
                              border-danger/30 bg-danger-bg p-3
                              text-sm text-danger">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />{verifyState.message}
              </div>
            )}
            <Input name="code" label="رمز التحقق" required inputMode="numeric"
                   maxLength={6} dir="ltr" placeholder="000000" autoComplete="one-time-code" />
            <Button type="submit" loading={verifying}>تأكيد التفعيل</Button>
          </form>
        ) : (
          <>
            {enroll && !enroll.ok && (
              <p role="alert" className="text-sm text-danger">{enroll.message}</p>
            )}
            {verifyState?.ok && (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 size={16} />{verifyState.message}
              </p>
            )}
            <Button icon={<KeyRound size={16} />} loading={starting}
                    onClick={() => startEnroll(async () => {
                      setEnroll(await startMfaEnrollment());
                    })}>
              تفعيل التحقق بخطوتين
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
