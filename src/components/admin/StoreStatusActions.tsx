'use client';
import { ReviewActions } from './ReviewActions';
import { setStoreStatus } from '@/lib/admin/actions';

/** إيقاف متجر وإعادة تفعيله — المتجر يُغلق ولا يُحذف (§20). */
export function StoreStatusActions({ storeId, status }: {
  storeId: string; status: string;
}) {
  const actions = status === 'suspended'
    ? [{ key: 'active', label: 'إعادة التفعيل' }]
    : [{
        key: 'suspended', label: 'إيقاف', tone: 'danger' as const,
        needsReason: true, reasonLabel: 'سبب إيقاف المتجر',
      }];

  return (
    <ReviewActions
      actions={actions}
      hint="الإيقاف يمنع الشراء ويُبقي البيانات كاملة."
      onRun={async (key, reason) => {
        const res = await setStoreStatus({
          storeId, status: key as 'active' | 'suspended', reason,
        });
        return res.ok ? { ok: true } : { ok: false, message: res.message };
      }}
    />
  );
}
