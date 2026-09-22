import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { ErrorState } from '@/components/ui/States';
import { PartnerDashboard } from '@/components/partner/PartnerDashboard';
import { loadPartnerDashboard } from '@/lib/partners/actions';

export const metadata: Metadata = {
  title: 'لوحة الشريك',
  robots: { index: false, follow: false },
};

// بيانات الشريك خاصة به ⇒ لا تصيير مسبق ولا تخزين
export const dynamic = 'force-dynamic';

export default async function PartnerPage() {
  const data = await loadPartnerDashboard();
  if (!data.ok) return <ErrorState description={data.message} />;

  return (
    <PartnerDashboard
      profile={data.data.profile}
      balance={data.data.balance}
      pendingPayouts={data.data.pendingPayouts}
      referrals={data.data.referrals}
      commissions={data.data.commissions}
      payouts={data.data.payouts}
      // مفتاح التكرار يُولَّد مع الصفحة: ضغطتان لا تُنشئان طلبين
      idempotencyKey={randomUUID()}
    />
  );
}
