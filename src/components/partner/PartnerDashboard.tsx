import Link from 'next/link';
import { ArrowLeft, Store, Wallet } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ReferralLinkCard } from './ReferralLinkCard';
import { SUBSCRIPTION_STATUS } from '@/lib/status';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';
import type {
  PartnerBalance, PartnerProfile, ReferralRow,
} from '@/lib/partners/actions';

/**
 * الصفحة الرئيسية للشريك — Mobile-first.
 *
 * الترتيب مقصود: الرابط، ثم المال، ثم المتاجر. ما يفعله الشريك
 * يوميًا أعلى الصفحة، وما يراجعه أسفلها.
 *
 * ★ لا رقم هنا محسوب في المتصفح: كل مبلغ يأتي من القاعدة.
 */
export function PartnerDashboard({
  profile, balance, referrals, accountReady, openPayout,
}: {
  profile: PartnerProfile;
  balance: PartnerBalance;
  referrals: ReferralRow[];
  accountReady: boolean;
  openPayout: boolean;
}) {
  const paidSubscriptions = referrals.reduce((n, r) => n + r.paidSubscriptions, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-ink-900">
          سوّق واحصل على عمولة دائمة
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          مع كل اشتراك وتجديد — بنسبة{' '}
          <span className="font-bold tabular">{profile.commissionRate}%</span>.
        </p>
      </header>

      <ReferralLinkCard shortLink={profile.shortLink}
                        legacyLink={profile.legacyLink}
                        rate={profile.commissionRate} />

      {profile.status !== 'active' && (
        <p role="alert" className="rounded-md border border-danger/30
                        bg-danger-bg p-3.5 text-sm text-danger">
          حسابك كشريك موقوف حاليًا. الإحالات والعمولات المسجَّلة محفوظة،
          ولا تُحتسب عمولات جديدة حتى يُعاد تفعيله.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="متاجر أحلتها" value={formatNumber(referrals.length)} />
        <Stat label="اشتراكات مؤكدة" value={formatNumber(paidSubscriptions)} />
        <Stat label="إجمالي العمولات" value={formatMoney(balance.total)} />
        <Stat label="المستحق" value={formatMoney(balance.payable)} accent />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
              <Wallet size={15} /> مستحقاتي
            </p>
            <p className="mt-1 text-xs text-ink-500">
              متاح {formatMoney(balance.payable)} ·{' '}
              قيد الصرف {formatMoney(balance.reserved)} ·{' '}
              مدفوع {formatMoney(balance.paid)}
            </p>
          </div>
          <Link href="/partner/payouts"
                className="inline-flex items-center gap-1 text-sm font-bold
                           text-teal-700 hover:underline">
            {openPayout ? 'متابعة طلب الصرف'
              : !accountReady ? 'أضف بيانات الاستلام'
              : 'طلب صرف'}
            <ArrowLeft size={14} />
          </Link>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="المتاجر المحالة"
                    description="اشتراك كل متجر وتجديداته وما نتج عنها من عمولة." />
        {referrals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Store size={32} strokeWidth={1.5} className="mx-auto text-ink-400" />
            <p className="mt-2 text-sm text-ink-500">
              لا إحالات بعد — شارك رابطك للبدء.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-200">
            {referrals.map((r) => (
              <li key={r.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                    {r.storeName ?? 'متجر'}
                  </span>
                  {r.subscriptionStatus && (
                    <Badge tone={SUBSCRIPTION_STATUS[r.subscriptionStatus]?.tone ?? 'neutral'}>
                      {SUBSCRIPTION_STATUS[r.subscriptionStatus]?.label
                        ?? r.subscriptionStatus}
                    </Badge>
                  )}
                  <span className="font-bold tabular text-ink-900">
                    {formatMoney(r.commissionTotal)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {r.planName ?? 'بلا باقة مدفوعة'}
                  {' · '}{formatNumber(r.paidSubscriptions)} اشتراك مؤكد
                  {r.lastPaidAt && ` · آخر دفعة ${formatDate(r.lastPaidAt)}`}
                  {r.periodEnd && ` · ينتهي ${formatDate(r.periodEnd)}`}
                  {r.commissionPayable > 0
                    && ` · مستحق ${formatMoney(r.commissionPayable)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent = false }: {
  label: string; value: string; accent?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tabular ${
        accent ? 'text-teal-700' : 'text-ink-900'}`}>{value}</p>
    </Card>
  );
}
