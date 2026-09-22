import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { ErrorState } from '@/components/ui/States';
import { SubscriptionPanel } from '@/components/dashboard/SubscriptionPanel';
import { loadPlatformPaymentInfo, loadSubscriptionPage } from '@/lib/subscriptions/actions';

export const metadata: Metadata = { title: 'الاشتراك' };

export default async function SubscriptionPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'settings:view');
  const [page, payment] = await Promise.all([
    loadSubscriptionPage(membership.storeId),
    loadPlatformPaymentInfo(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الاشتراك</h1>
        <p className="text-sm text-ink-500">
          الدفع بتحويل يدوي يراجعه فريقنا — لا تجديد آلي ولا خصم من بطاقة.
        </p>
      </div>

      {page.ok ? (
        <SubscriptionPanel
          storeId={membership.storeId}
          current={page.data.current}
          plans={page.data.plans}
          requests={page.data.requests}
          payment={payment.ok ? payment.data : null}
          canManage={can(membership, 'subscription:manage')}
          // مفتاح التكرار يُولَّد مع الصفحة: ضغطتان لا تُنشئان طلبين
          idempotencyKey={randomUUID()}
        />
      ) : (
        <ErrorState description={page.message} />
      )}
    </div>
  );
}
