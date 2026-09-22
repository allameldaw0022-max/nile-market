'use client';
import { ReviewActions } from './ReviewActions';
import { reviewSubscriptionRequest } from '@/lib/admin/actions';

export function SubscriptionReviewRow({ requestId }: { requestId: string }) {
  return (
    <ReviewActions
      hint="الاعتماد يُفعّل الاشتراك ويقيّد إيرادًا وعمولة شريك."
      actions={[
        { key: 'approve', label: 'اعتماد' },
        { key: 'reject', label: 'رفض', tone: 'danger',
          needsReason: true, reasonLabel: 'سبب رفض الطلب' },
      ]}
      onRun={async (key, reason) => {
        const res = await reviewSubscriptionRequest({
          requestId, action: key as 'approve' | 'reject', reason,
        });
        return res.ok ? { ok: true } : { ok: false, message: res.message };
      }}
    />
  );
}
