'use client';
import { Landmark } from 'lucide-react';
import { ReceiptViewer } from '@/components/shared/ReceiptViewer';
import { subscriptionProofUrl } from '@/lib/payments/receipts';

/**
 * إيصال طلب اشتراك أمام موظف المنصة.
 * لا يمرّ من هنا مسار ولا معرّف ملف — معرّف الطلب وحده، والقاعدة
 * تربطه بإيصاله بعد فحص صلاحية `subscriptions:view`.
 */
export function SubscriptionProof({ requestId, mime }: {
  requestId: string; mime: string | null;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold text-ink-700">
        <Landmark size={13} /> إيصال التحويل
      </p>
      <ReceiptViewer mime={mime}
                     load={() => subscriptionProofUrl(requestId)} />
    </div>
  );
}
