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

const OPEN = ['submitted', 'pending_review', 'approved'];

export default async function PartnerPage() {
  const data = await loadPartnerDashboard();
  if (!data.ok) return <ErrorState description={data.message} />;

  return (
    <PartnerDashboard
      profile={data.data.profile}
      balance={data.data.balance}
      referrals={data.data.referrals}
      accountReady={data.data.accountReady}
      openPayout={data.data.payouts.some((p) => OPEN.includes(p.status))}
    />
  );
}
