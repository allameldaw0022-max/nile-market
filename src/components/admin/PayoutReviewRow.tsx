'use client';
import { ReviewActions } from './ReviewActions';
import { markPayoutPaid, reviewPayout } from '@/lib/admin/actions';

/**
 * أزرار مراجعة طلب صرف.
 *
 * ★ الخطوات مفصولة عمدًا: مَن سجّل الطلب لا يظهر له زر الاعتماد؟ بل
 * يظهر — والقاعدة ترفضه بقيد CHECK. إخفاؤه كان سيوهم أن المنع في
 * الواجهة، وهو في الحقيقة في الجدول ويسري على service_role أيضًا.
 */
export function PayoutReviewRow({ payoutId, status, canRecord, canApprove }: {
  payoutId: string;
  status: string;
  canRecord: boolean;
  canApprove: boolean;
}) {
  const actions = [];

  if (status === 'submitted' && canRecord) {
    actions.push({ key: 'record', label: 'تسجيل الطلب', tone: 'outline' as const });
  }
  if (status === 'pending_review' && canApprove) {
    actions.push({ key: 'approve', label: 'اعتماد' });
    actions.push({
      key: 'reject', label: 'رفض', tone: 'danger' as const,
      needsReason: true, reasonLabel: 'سبب رفض الصرف',
    });
  }
  if (status === 'approved' && canApprove) {
    actions.push({ key: 'paid', label: 'تأكيد الصرف' });
  }

  if (actions.length === 0) return null;

  return (
    <ReviewActions
      actions={actions}
      hint="فصل المهام: لا يعتمد مَن سجّل الطلب ولا مَن بادر به."
      onRun={async (key, reason) => {
        if (key === 'paid') {
          const res = await markPayoutPaid({ payoutId });
          return res.ok ? { ok: true } : { ok: false, message: res.message };
        }
        const res = await reviewPayout({
          payoutId, action: key as 'record' | 'approve' | 'reject', reason,
        });
        return res.ok ? { ok: true } : { ok: false, message: res.message };
      }}
    />
  );
}
