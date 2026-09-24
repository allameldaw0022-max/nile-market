'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Copy, Megaphone, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  assignMarketingPartner, revokeMarketingPartner,
} from '@/lib/admin/people';

/**
 * تعيين المستخدم مسوّقًا أو إزالته من الدور.
 *
 * ★ الزرّ ليس الحاجز: `requirePlatformAccess('partners','edit')` في
 * الفعل الخادمي، ثم فحص الصلاحية مرة أخرى داخل دالة القاعدة. إخفاء
 * الزرّ راحة للعين لا حماية.
 *
 * ★ لا نسبة ولا كود يُرسلان من هنا — القاعدة تقرر الاثنين.
 */
export function MarketingPartnerActions({ profileId, partnerStatus, referralCode }: {
  profileId: string;
  /** null = ليس مسوّقًا · active · suspended · invited */
  partnerStatus: string | null;
  referralCode: string | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const isPartner = partnerStatus === 'active';

  const assign = () => start(async () => {
    setError(null);
    const res = await assignMarketingPartner(profileId);
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  const revoke = () => start(async () => {
    setError(null);
    const res = await revokeMarketingPartner(profileId);
    if (!res.ok) { setError(res.message); return; }
    setAsking(false);
    router.refresh();
  });

  const copy = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* الحافظة محجوبة */ }
  };

  if (asking) {
    return (
      <div className="w-full space-y-2 rounded-md border border-ink-200 p-3">
        <p className="text-xs text-ink-600">
          الإزالة توقف لوحة المسوّق وتمنع أي عمولة جديدة. الإحالات
          والعمولات المسجَّلة تبقى كما هي — عمل ماضٍ مستحَق.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" loading={pending} onClick={revoke}>
            تأكيد الإزالة
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            تراجع
          </Button>
        </div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isPartner ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {referralCode && (
            <button type="button" onClick={copy}
                    title="نسخ رمز الإحالة"
                    className="inline-flex items-center gap-1 rounded bg-ink-50
                               px-2 py-1 text-xs font-bold text-ink-700
                               hover:text-teal-700">
              <span dir="ltr" className="tabular">{referralCode}</span>
              {copied ? <Check size={12} className="text-success" />
                      : <Copy size={12} />}
            </button>
          )}
          <Button size="sm" variant="outline" icon={<UserMinus size={14} />}
                  onClick={() => { setAsking(true); setError(null); }}>
            إزالة من دور المسوّق
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" icon={<Megaphone size={14} />}
                loading={pending} onClick={assign}>
          {partnerStatus === 'suspended' ? 'إعادة التعيين كمسوّق' : 'تعيين كمسوّق'}
        </Button>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1 text-xs text-danger">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
