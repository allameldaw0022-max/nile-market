import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { ErrorState } from '@/components/ui/States';
import { PayoutPanel } from '@/components/partner/PayoutPanel';
import { loadPartnerPayouts } from '@/lib/partners/actions';

export const metadata: Metadata = {
  title: 'مستحقاتي — الشريك',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PartnerPayoutsPage() {
  const data = await loadPartnerPayouts();
  if (!data.ok) return <ErrorState description={data.message} />;

  return (
    <PayoutPanel
      balance={data.data.balance}
      payouts={data.data.payouts}
      account={data.data.account}
      // مفتاح التكرار يُولَّد مع الصفحة: ضغطتان لا تُنشئان طلبين
      idempotencyKey={randomUUID()}
    />
  );
}
