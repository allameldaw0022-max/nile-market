import type { Metadata } from 'next';
import { BadgeCheck } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { SubscriptionReviewRow } from '@/components/admin/SubscriptionReviewRow';
import { SubscriptionProof } from '@/components/admin/SubscriptionProof';
import { formatDateTime, formatMoney } from '@/lib/money/format';

export const metadata: Metadata = {
  title: 'الاشتراكات — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'قيد المراجعة', tone: 'warning' },
  approved: { label: 'معتمد', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  cancelled: { label: 'مسحوب', tone: 'neutral' },
};

type RequestRow = {
  id: string; net_amount: number; status: string; reference: string | null;
  created_at: string; rejection_reason: string | null;
  proof_media_id: string | null;
  stores: { name: string; slug: string } | null;
  plans: { name: string } | null;
  media_files: { mime_type: string } | null;
};

export default async function AdminSubscriptionsPage() {
  await requirePlatformAccess('subscriptions', 'view');
  const actor = await getActor();
  const canApprove = actor.kind === 'user'
    && adminHasLevel(actor, 'subscriptions', 'approve');

  const supabase = await createClient();
  const { data } = await supabase
    .from('subscription_requests')
    .select('id, net_amount, status, reference, created_at, rejection_reason, ' +
            'proof_media_id, stores(name, slug), plans(name), ' +
            'media_files(mime_type)')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as RequestRow[];
  const pending = rows.filter((r) => r.status === 'pending');
  const reviewed = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">طلبات الاشتراك</h1>
        <p className="text-sm text-ink-500">
          راجع إيصال التحويل قبل القرار. الاعتماد يُفعّل الاشتراك ويقيّد
          الإيراد وعمولة الشريك في معاملة واحدة.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="قيد المراجعة"
                    description={`${pending.length} طلب ينتظر قرارك.`} />
        {pending.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<BadgeCheck size={32} strokeWidth={1.5} />}
                        title="لا طلبات معلّقة" />
          </div>
        ) : (
          <ul className="divide-y divide-ink-200">
            {pending.map((r) => (
              <li key={r.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink-900">
                      {r.stores?.name ?? '—'}
                    </p>
                    <p className="text-xs text-ink-500">
                      {r.plans?.name ?? '—'} · {formatDateTime(r.created_at)}
                      {/* D20: الاشتراك تحويل يدوي حصرًا — لا بوابة دفع */}
                      {' · تحويل بنكي'}
                      {r.reference && <span dir="ltr"> · {r.reference}</span>}
                    </p>
                  </div>
                  <span className="font-extrabold tabular text-ink-900">
                    {formatMoney(r.net_amount)}
                  </span>
                  {canApprove ? (
                    <SubscriptionReviewRow requestId={r.id} />
                  ) : (
                    <Badge tone="warning">قيد المراجعة</Badge>
                  )}
                </div>

                {/* ★ لا اعتماد على العمياء: الإيصال معروض مع الطلب */}
                <div className="mt-3 rounded-md border border-ink-200 p-3">
                  {r.proof_media_id ? (
                    <SubscriptionProof requestId={r.id}
                                       mime={r.media_files?.mime_type ?? null} />
                  ) : (
                    <p className="text-xs text-ink-500">
                      لا إيصال مرفق — هذا الطلب سابق لإلزامية الإيصال.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {reviewed.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="طلبات سابقة" />
          <ul className="divide-y divide-ink-200">
            {reviewed.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                      {r.stores?.name ?? '—'}
                    </span>
                    <span className="text-xs text-ink-500">
                      {r.plans?.name ?? '—'} · {formatDateTime(r.created_at)}
                      {r.rejection_reason && (
                        <span className="block text-danger">
                          {r.rejection_reason}
                        </span>
                      )}
                    </span>
                    <span className="font-bold tabular text-ink-900">
                      {formatMoney(r.net_amount)}
                    </span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  {/* الإيصال يبقى متاحًا بعد القرار: التدقيق لاحقًا
                      يحتاج ما رآه المراجع لحظتها */}
                  {r.proof_media_id && (
                    <div className="mt-2">
                      <SubscriptionProof requestId={r.id}
                                         mime={r.media_files?.mime_type ?? null} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
