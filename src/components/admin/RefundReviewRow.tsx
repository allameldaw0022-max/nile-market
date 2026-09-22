'use client';
import { ReviewActions } from './ReviewActions';
import { completeRefund, reviewRefund } from '@/lib/admin/actions';

/**
 * إجراءات طلب الاسترداد.
 *
 * ★ الأزرار تُخفى عمّن لا يجوز له الإجراء (مَن بادر لا يسجّل، ومَن
 * سجّل لا يعتمد) — لكن الإخفاء تحسين تجربة فقط: القيد في الجدول هو
 * ما يرفض فعلًا، ولا يتجاوزه حتى service_role.
 */
export function RefundReviewRow({
  refundId, status, canRecord, canApprove, isInitiator, isRequester,
}: {
  refundId: string; status: string;
  canRecord: boolean; canApprove: boolean;
  isInitiator: boolean; isRequester: boolean;
}) {
  const actions = [];

  if (status === 'submitted' && canRecord && !isInitiator) {
    actions.push({ key: 'record', label: 'تسجيل الطلب', tone: 'outline' as const });
  }
  if (status === 'pending_review' && canApprove && !isRequester && !isInitiator) {
    actions.push({ key: 'approve', label: 'اعتماد' });
  }
  if (['submitted', 'pending_review'].includes(status) && canApprove) {
    actions.push({
      key: 'reject', label: 'رفض', tone: 'danger' as const,
      needsReason: true, reasonLabel: 'سبب الرفض',
    });
  }
  if (status === 'approved' && canApprove) {
    actions.push({ key: 'complete', label: 'تأكيد التنفيذ' });
  }

  const hint = status === 'submitted' && isInitiator
    ? 'أنت مَن بادر بالطلب — يسجّله موظف آخر'
    : status === 'pending_review' && (isRequester || isInitiator)
      ? 'شاركت في الطلب — يعتمده موظف ثالث'
      : undefined;

  if (actions.length === 0) {
    return hint
      ? <p className="text-[11px] text-sand-600">{hint}</p>
      : null;
  }

  return (
    <ReviewActions
      actions={actions}
      hint={hint}
      onRun={async (key, reason) => {
        if (key === 'complete') return completeRefund({ refundId });
        return reviewRefund({
          refundId,
          action: key as 'record' | 'approve' | 'reject',
          reason,
        });
      }}
    />
  );
}
