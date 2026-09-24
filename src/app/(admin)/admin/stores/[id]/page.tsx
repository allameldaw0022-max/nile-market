import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ChevronRight, ExternalLink, Globe, Handshake, MessageCircle, User,
} from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { StoreStatusActions } from '@/components/admin/StoreStatusActions';
import { STORE_STATUS, SUBSCRIPTION_STATUS } from '@/lib/status';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { localPhone, waNumber } from '@/lib/phone';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'المتجر — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const DOMAIN_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending:    { label: 'بانتظار التحقق', tone: 'warning' },
  verifying:  { label: 'قيد التحقق',     tone: 'warning' },
  active:     { label: 'مفعَّل',          tone: 'success' },
  ssl_active: { label: 'مفعَّل + SSL',    tone: 'success' },
  failed:     { label: 'فشل',            tone: 'danger' },
};

/**
 * ملف متجر واحد أمام موظف المنصة.
 *
 * ★ قراءة لا انتحال: الصفحة تعرض ما تسمح به سياسات المنصة، ولا
 * تفتح لوحة التاجر ولا تكتب في متجره. تغيير الحالة (إيقاف/تفعيل)
 * يبقى في مساره المدقَّق كما هو.
 */
export default async function AdminStoreDetailPage(
  { params }: PageProps<'/admin/stores/[id]'>,
) {
  await requirePlatformAccess('stores', 'view');
  const actor = await getActor();
  const canEdit = actor.kind === 'user' && adminHasLevel(actor, 'stores', 'edit');
  const canSeeUsers = actor.kind === 'user' && adminHasLevel(actor, 'users', 'view');
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'admin_store_detail', { p_store_id: id });
  if (error) {
    // غير موجود ⇒ 404، وأي خطأ آخر يُعرض كما هو
    if (error.code === 'P0002') notFound();
    return <ErrorState description="تعذّر تحميل بيانات المتجر" />;
  }
  if (!data) notFound();

  const { store, owner, subscription, partner, counts, sales, domains } = data;
  const url = store.host ? `https://${store.host}` : null;

  return (
    <div className="space-y-5">
      <Link href="/admin/stores"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> المتاجر
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-ink-900">{store.name}</h1>
          <p className="truncate text-sm text-ink-500" dir="ltr">
            {store.slug} · أُنشئ {formatDate(store.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip map={STORE_STATUS} value={store.status} />
          {!store.can_checkout && (
            <Badge tone="warning">الشراء متوقف</Badge>
          )}
          {canEdit && store.status !== 'closed' && (
            <StoreStatusActions storeId={store.id} status={store.status} />
          )}
        </div>
      </div>

      {/* ★ «ادخل على المتجر»: فتح واجهته كما يراها الزبون */}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Button icon={<ExternalLink size={15} />} className="w-full sm:w-auto">
            فتح المتجر
          </Button>
        </a>
      ) : (
        <p className="rounded-md border border-ink-200 bg-ink-50 p-3.5 text-sm text-ink-600">
          لا نطاق مفعَّل لهذا المتجر بعد — لا يمكن فتحه.
        </p>
      )}

      {store.suspended_reason && (
        <p role="alert" className="rounded-md border border-danger/30
                        bg-danger-bg p-3.5 text-sm text-danger">
          سبب الإيقاف: {store.suspended_reason}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="المنتجات"
              value={`${formatNumber(counts.products_active)} / ${formatNumber(counts.products)}`} />
        <Stat label="الطلبات" value={formatNumber(counts.orders)} />
        <Stat label="طلبات مفتوحة" value={formatNumber(counts.orders_open)} />
        <Stat label="المحصَّل" value={formatMoney(sales.paid_total)} />
      </div>

      <Card>
        <CardHeader title="صاحب المتجر" />
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <User size={15} className="text-ink-500" />
            <span className="font-bold text-ink-900">{owner.name ?? 'بلا اسم'}</span>
            {owner.account_status && owner.account_status !== 'active' && (
              <Badge tone="danger">
                {owner.account_status === 'suspended' ? 'موقوف' : 'مغلق'}
              </Badge>
            )}
            {!owner.email_verified_at && (
              <Badge tone="warning">لم يؤكّد بريده</Badge>
            )}
          </div>
          <p className="truncate text-sm text-ink-600" dir="ltr">
            {owner.email ?? '—'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {owner.phone ? (
              <a href={`https://wa.me/${waNumber(owner.phone)}`}
                 target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 rounded-md border
                            border-ink-200 px-3 py-2 text-[13px] font-bold
                            text-teal-700 hover:border-teal-500">
                <MessageCircle size={14} />
                <span dir="ltr" className="tabular">{localPhone(owner.phone)}</span>
              </a>
            ) : (
              <span className="text-sm text-ink-500">لا رقم مسجَّل</span>
            )}
            {canSeeUsers && owner.profile_id && (
              <Link href={`/admin/users?q=${encodeURIComponent(owner.email ?? '')}`}
                    className="text-[13px] font-bold text-teal-700 hover:underline">
                في قائمة المستخدمين
              </Link>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="الاشتراك" />
          <div className="space-y-2 p-5 text-sm">
            {subscription ? (
              <>
                <Row label="الباقة" value={subscription.plan ?? '—'} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-500">الحالة</span>
                  <StatusChip map={SUBSCRIPTION_STATUS} value={subscription.status} />
                </div>
                <Row label="بدأ في"
                     value={subscription.started_at
                       ? formatDate(subscription.started_at) : '—'} />
                <Row label="ينتهي في"
                     value={subscription.current_period_end
                       ? formatDate(subscription.current_period_end)
                       : 'بلا تاريخ انتهاء'} />
                {subscription.grace_ends_at && (
                  <Row label="فترة السماح حتى"
                       value={formatDate(subscription.grace_ends_at)} />
                )}
              </>
            ) : (
              <p className="text-ink-500">لا اشتراك مسجَّل.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="النطاقات" />
          {domains.length === 0 ? (
            <p className="p-5 text-sm text-ink-500">لا نطاقات.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {domains.map((d) => {
                const s = DOMAIN_STATUS[d.status]
                  ?? { label: d.status, tone: 'neutral' as const };
                return (
                  <li key={d.hostname}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <Globe size={14} className="shrink-0 text-ink-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-900"
                          dir="ltr">{d.hostname}</span>
                    {d.is_primary && <Badge tone="info">أساسي</Badge>}
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="معلومات إضافية" />
        <div className="space-y-2 p-5 text-sm">
          <Row label="العملاء" value={formatNumber(counts.customers)} />
          <Row label="أعضاء الفريق" value={formatNumber(counts.team)} />
          <Row label="آخر طلب"
               value={sales.last_order_at
                 ? formatDateTime(sales.last_order_at) : 'لا طلبات بعد'} />
          <Row label="نُشر في"
               value={store.published_at ? formatDate(store.published_at) : 'لم يُنشر'} />
          {partner && (
            <div className="flex items-center justify-between gap-3 border-t
                            border-ink-200 pt-2">
              <span className="flex items-center gap-1.5 text-ink-500">
                <Handshake size={13} /> جاء عبر مسوّق
              </span>
              <Link href={`/admin/partners/${partner.partner_id}`}
                    className="font-bold text-teal-700 hover:underline">
                {partner.name}
                {partner.serial_no !== null && (
                  <span className="tabular"> #{partner.serial_no}</span>
                )}
              </Link>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular text-ink-900">{value}</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="font-bold text-ink-900">{value}</span>
    </div>
  );
}
