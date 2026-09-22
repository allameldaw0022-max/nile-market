import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, MessageCircle, Phone } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { OrderStatusActions } from '@/components/dashboard/OrderStatusActions';
import { RecordPaymentForm } from '@/components/dashboard/RecordPaymentForm';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '@/lib/status';
import { formatDateTime, formatMoney } from '@/lib/money/format';

export const metadata: Metadata = { title: 'تفاصيل الطلب' };

type OrderRow = {
  id: string; order_number: string; status: string; payment_status: string;
  payment_method: string; contact_name: string; contact_phone: string;
  contact_email: string | null; delivery_zone_name: string | null;
  delivery_address: { line?: string; landmark?: string | null } | null;
  subtotal: number; delivery_fee: number; discount_total: number; total: number;
  paid_total: number; refunded_total: number; coupon_code: string | null;
  note: string | null; created_at: string; customer_id: string | null;
};

type ItemRow = {
  id: string; product_id: string | null; product_name: string;
  variant_name: string | null; sku: string | null;
  unit_price: number; quantity: number; line_total: number;
};

type HistoryRow = {
  id: string; from_status: string | null; to_status: string;
  reason: string | null; actor_id: string | null; created_at: string;
};

type PaymentRow = {
  id: string; method: string; status: string; amount: number;
  reference: string | null; paid_at: string | null; created_at: string;
};

const ORDER_SELECT =
  'id, order_number, status, payment_status, payment_method, contact_name, ' +
  'contact_phone, contact_email, delivery_zone_name, delivery_address, subtotal, ' +
  'delivery_fee, discount_total, total, paid_total, refunded_total, coupon_code, ' +
  'note, created_at, customer_id';

export default async function OrderDetailPage(
  { params }: PageProps<'/dashboard/orders/[id]'>,
) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'orders:view');
  const { id } = await params;

  const supabase = await createClient();
  const { data: orderRaw } = await supabase
    .from('orders').select(ORDER_SELECT)
    .eq('id', id).eq('store_id', membership.storeId)
    .maybeSingle();

  // طلب متجر آخر ⇒ 404 لا 403: لا نؤكد وجوده لمن لا يملكه
  if (!orderRaw) notFound();
  const order = orderRaw as unknown as OrderRow;

  const [{ data: itemRows }, { data: historyRows }, { data: paymentRows }, { data: team }] =
    await Promise.all([
      supabase.from('order_items')
        .select('id, product_id, product_name, variant_name, sku, unit_price, ' +
                'quantity, line_total')
        .eq('order_id', order.id).order('created_at'),
      supabase.from('order_status_history')
        .select('id, from_status, to_status, reason, actor_id, created_at')
        .eq('order_id', order.id).order('created_at'),
      supabase.from('payments')
        .select('id, method, status, amount, reference, paid_at, created_at')
        .eq('order_id', order.id).order('created_at'),
      supabase.from('store_team').select('profile_id, full_name')
        .eq('store_id', membership.storeId),
    ]);

  const items = (itemRows ?? []) as unknown as ItemRow[];
  const history = (historyRows ?? []) as unknown as HistoryRow[];
  const payments = (paymentRows ?? []) as unknown as PaymentRow[];
  const nameOf = new Map((team ?? []).map((m) => [m.profile_id, m.full_name] as const));

  const remaining = Math.max(Number(order.total) - Number(order.paid_total), 0);
  const address = order.delivery_address ?? {};
  const waNumber = order.contact_phone.replace(/\D/g, '');

  return (
    <div className="space-y-5">
      <Link href="/dashboard/orders"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> الطلبات
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tabular text-navy-900" dir="ltr">
            {order.order_number}
          </h1>
          <p className="text-sm text-sand-600">{formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip map={PAYMENT_STATUS} value={order.payment_status} />
          <StatusChip map={ORDER_STATUS} value={order.status} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="المنتجات" />
            <ul className="divide-y divide-sand-200">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    {/* لقطة نصية: الاسم محفوظ في الطلب ولا يتغيّر بتعديل المنتج */}
                    <p className="font-bold text-navy-900">{item.product_name}</p>
                    {item.variant_name && (
                      <p className="text-xs text-sand-600">{item.variant_name}</p>
                    )}
                    <p className="text-xs text-sand-600 tabular">
                      {formatMoney(item.unit_price)} × {item.quantity}
                      {item.sku && <span dir="ltr"> · {item.sku}</span>}
                    </p>
                  </div>
                  <p className="font-bold tabular text-navy-900">
                    {formatMoney(item.line_total)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="space-y-2 border-t border-sand-200 px-5 py-4 text-sm">
              <Row label="المجموع" value={formatMoney(order.subtotal)} />
              <Row label="التوصيل" value={formatMoney(order.delivery_fee)} />
              {Number(order.discount_total) > 0 && (
                <Row label={`الخصم${order.coupon_code ? ` (${order.coupon_code})` : ''}`}
                     value={`− ${formatMoney(order.discount_total)}`} />
              )}
              <div className="flex items-baseline justify-between border-t border-sand-200 pt-2">
                <dt className="font-bold text-navy-900">الإجمالي</dt>
                <dd className="text-lg font-extrabold tabular text-navy-900">
                  {formatMoney(order.total)}
                </dd>
              </div>
              <Row label="المدفوع" value={formatMoney(order.paid_total)} />
              {remaining > 0 && (
                <Row label="المتبقي" value={formatMoney(remaining)} danger />
              )}
              {Number(order.refunded_total) > 0 && (
                <Row label="المسترد" value={formatMoney(order.refunded_total)} />
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="سجل الطلب"
                        description="سجل إلحاقي لا يُعدَّل ولا يُحذف." />
            <ol className="divide-y divide-sand-200">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                  <Badge tone={ORDER_STATUS[h.to_status]?.tone ?? 'neutral'}>
                    {ORDER_STATUS[h.to_status]?.label ?? h.to_status}
                  </Badge>
                  {h.from_status && (
                    <span className="text-xs text-sand-600">
                      من {ORDER_STATUS[h.from_status]?.label ?? h.from_status}
                    </span>
                  )}
                  <span className="text-xs text-sand-600">
                    {(h.actor_id ? nameOf.get(h.actor_id) : null) ?? 'الزبون'}
                  </span>
                  <span className="ms-auto text-xs text-sand-500">
                    {formatDateTime(h.created_at)}
                  </span>
                  {h.reason && (
                    <p className="w-full text-xs text-sand-700">السبب: {h.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          {payments.length > 0 && (
            <Card>
              <CardHeader title="الدفعات" />
              <ul className="divide-y divide-sand-200">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1
                                            px-5 py-3 text-sm">
                    <span className="font-bold tabular text-navy-900">
                      {formatMoney(p.amount)}
                    </span>
                    <span className="text-sand-600">
                      {PAYMENT_METHOD[p.method] ?? p.method}
                    </span>
                    {p.reference && (
                      <span className="text-xs text-sand-600" dir="ltr">{p.reference}</span>
                    )}
                    <span className="ms-auto text-xs text-sand-500">
                      {formatDateTime(p.paid_at ?? p.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="الزبون" />
            <div className="space-y-3 p-5 text-sm">
              <div>
                <p className="font-bold text-navy-900">{order.contact_name}</p>
                <p className="tabular text-sand-700" dir="ltr">{order.contact_phone}</p>
                {order.contact_email && (
                  <p className="text-sand-600" dir="ltr">{order.contact_email}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <a href={`tel:${order.contact_phone}`}
                   className="inline-flex items-center gap-1.5 rounded-[--radius-md] border
                              border-sand-300 px-3 py-2 text-[13px] font-bold text-navy-700
                              hover:border-nile-500">
                  <Phone size={14} /> اتصال
                </a>
                <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 rounded-[--radius-md] border
                              border-sand-300 px-3 py-2 text-[13px] font-bold text-navy-700
                              hover:border-nile-500">
                  <MessageCircle size={14} /> واتساب
                </a>
              </div>

              <div className="border-t border-sand-200 pt-3">
                <p className="text-xs font-bold text-sand-600">التوصيل</p>
                <p className="text-navy-900">{order.delivery_zone_name ?? '—'}</p>
                {address.line && <p className="text-sand-700">{address.line}</p>}
                {address.landmark && (
                  <p className="text-xs text-sand-600">{address.landmark}</p>
                )}
              </div>

              <div className="border-t border-sand-200 pt-3">
                <p className="text-xs font-bold text-sand-600">طريقة الدفع</p>
                <p className="text-navy-900">
                  {PAYMENT_METHOD[order.payment_method] ?? order.payment_method}
                </p>
              </div>

              {order.note && (
                <div className="border-t border-sand-200 pt-3">
                  <p className="text-xs font-bold text-sand-600">ملاحظة الزبون</p>
                  <p className="text-navy-700">{order.note}</p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="الإجراءات" />
            <div className="space-y-4 p-5">
              {can(membership, 'orders:update') ? (
                <OrderStatusActions storeId={membership.storeId} orderId={order.id}
                                    status={order.status} />
              ) : (
                <p className="text-sm text-sand-600">
                  لا تملك صلاحية تغيير حالة الطلب.
                </p>
              )}

              {can(membership, 'orders:payment') && order.status !== 'cancelled' && (
                <div className="border-t border-sand-200 pt-4">
                  <RecordPaymentForm storeId={membership.storeId} orderId={order.id}
                                     remaining={remaining} idempotencyKey={randomUUID()} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, danger = false }: {
  label: string; value: string; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sand-600">{label}</dt>
      <dd className={`font-bold tabular ${danger ? 'text-[--color-danger]' : 'text-navy-900'}`}>
        {value}
      </dd>
    </div>
  );
}
