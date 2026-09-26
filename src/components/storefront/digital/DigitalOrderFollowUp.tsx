'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { claimMyOrder } from '@/lib/digital/actions';
import { useViewer } from '../ViewerProvider';

/**
 * متابعة الطلب بحساب Google.
 *
 * ★★ لا يُبنى Auth جديد: `signInWithOAuth` على **مضيف المتجر**، فيعود
 * Google إلى `/auth/callback` القائم على نفس المضيف وتُكتب الجلسة
 * عليه وحده — وهو ما يمنع سريان جلسة متجرٍ على متجر آخر.
 *
 * ★★ ولا رقم طلب ولا توكن يمرّ في رابط ولا في نموذج: الربط يقرؤهما
 * من كوكي الطلب HttpOnly على الخادم. فلا يُربط طلب أحدٍ بحساب آخر
 * ولو عُرِف رقمه.
 *
 * ★ والشراء لا يتطلّب حسابًا أصلًا — هذا عرضٌ بعد النجاح لا بوّابة.
 */
export function DigitalOrderFollowUp({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const { signedIn, ready } = useViewer();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/order` },
      });
      if (e) throw new Error(e.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تسجيل الدخول');
      setBusy(false);
    }
  };

  const link = async () => {
    setBusy(true); setError(null);
    const res = await claimMyOrder(window.location.hostname);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setDone(true);
    router.refresh();
  };

  const card = {
    background: 'var(--d-surface)', border: '1px solid var(--d-border)',
  } as const;

  if (done) {
    return (
      <div className="mt-5 rounded-lg p-4" style={card} role="status">
        <p className="flex items-center gap-2 text-[14px] font-bold">
          <Check size={16} aria-hidden style={{ color: 'var(--d-success)' }} />
          تمّ ربط الطلب بحسابك
        </p>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--d-text-2)' }}>
          ستجد الطلب {orderNumber} وكل طلباتك السابقة في «حسابي»،
          وتصلك التحديثات عليه.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-lg p-4" style={card}>
      <p className="text-[14px] font-bold">تابع طلبك</p>
      <p className="mt-1 text-[12.5px] leading-relaxed"
         style={{ color: 'var(--d-text-2)' }}>
        سجّل الدخول لتربط هذا الطلب بحسابك، فترى حالته وكل طلباتك
        السابقة وتصلك تحديثاته.
      </p>

      <button type="button" disabled={busy || !ready}
              onClick={() => void (signedIn ? link() : signIn())}
              className="mt-3 inline-flex h-11 items-center justify-center gap-2
                         rounded-md px-4 text-[14px] font-bold disabled:opacity-60"
              style={{ background: 'var(--d-accent-surface)',
                       color: 'var(--d-on-accent)' }}>
        {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
        {signedIn ? 'اربط الطلب بحسابي' : 'تسجيل الدخول بحساب Google لمتابعة طلبك'}
      </button>

      {error && (
        <p role="alert" className="mt-2.5 flex items-start gap-2 text-[12.5px]"
           style={{ color: 'var(--d-danger)' }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
