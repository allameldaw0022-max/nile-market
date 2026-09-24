import type { Metadata } from 'next';
import { ErrorState } from '@/components/ui/States';
import { PayoutAccountForm } from '@/components/partner/PayoutAccountForm';
import { loadPartnerAccount } from '@/lib/partners/actions';

export const metadata: Metadata = {
  title: 'الإعدادات — الشريك',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PartnerSettingsPage() {
  const account = await loadPartnerAccount();
  if (!account.ok) return <ErrorState description={account.message} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-ink-900">الإعدادات</h1>
      </header>
      <PayoutAccountForm account={account.data} />
    </div>
  );
}
