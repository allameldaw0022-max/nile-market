import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, MessageCircle, Phone } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/Badge';
import { CustomerNote } from '@/components/dashboard/CustomerNote';
import { ORDER_STATUS, PAYMENT_STATUS } from '@/lib/status';
import { formatDate, formatDateTime, formatMoney } from '@/lib/money/format';

export const metadata: Metadata = { title: 'ملف العميل' };

export default async function CustomerPage(
  { params }: PageProps<'/dashboard/customers/[id]'>,
) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'customers:view');
  const { id } = await params;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, email, notes, orders_count, total_spent, first_order_at, last_order_at, marketing_consent, anonymized_at, created_at')
    .eq('id', id).eq('store_id', membership.storeId).is('deleted_at', null)
    .maybeSingle();

  // عميل متجر آخر ⇒ 404 لا 403
  if (!customer) notFound();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, payment_status, total, created_at')
    .eq('store_id', membership.storeId).eq('customer_id', customer.id)
    .order('created_at', { ascending: false }).limit(20);

  const anonymized = customer.anonymized_at !== null;
  const phone = customer.phone ?? '';
  const waNumber = phone.replace(/\D/g, '');

  return (
    <div className="space-y-5">
      <Link href="/dashboard/customers"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> العملاء
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-navy-900">
          {anonymized ? 'عميل محذوف' : (customer.name ?? 'بلا اسم')}
        </h1>
        <p className="text-sm text-sand-600">
          عميل في هذا المتجر منذ {formatDate(customer.created_at)}
        </p>
      </div>

      {anonymized && (
        <p role="status" className="rounded-[--radius-md] border border-sand-300
                        bg-sand-100 p-3.5 text-sm text-sand-700">
          طلب هذا العميل حذف بياناته. الطلبات والفواتير تبقى كما هي لأنها سجل
          مالي، وبياناته الشخصية أُزيلت.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="عدد الطلبات" value={String(customer.orders_count)} />
        <StatCard label="إجمالي الإنفاق" value={formatMoney(customer.total_spent)} />
        <StatCard label="آخر طلب"
                  value={customer.last_order_at ? formatDate(customer.last_order_at) : '—'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="الطلبات" description="آخر 20 طلبًا." />
          {!orders || orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-sand-600">لا طلبات.</p>
          ) : (
            <ul className="divide-y divide-sand-200">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/dashboard/orders/${o.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3
                                   hover:bg-sand-50">
                    <span className="font-extrabold tabular text-navy-900" dir="ltr">
                      {o.order_number}
                    </span>
                    <span className="flex-1 text-xs text-sand-600">
                      {formatDateTime(o.created_at)}
                    </span>
                    <span className="font-bold tabular text-navy-900">
                      {formatMoney(o.total)}
                    </span>
                    <StatusChip map={PAYMENT_STATUS} value={o.payment_status} />
                    <StatusChip map={ORDER_STATUS} value={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="بيانات التواصل" />
            <div className="space-y-3 p-5 text-sm">
              {anonymized ? (
                <p className="text-sand-600">أُزيلت بيانات التواصل.</p>
              ) : (
                <>
                  {phone && (
                    <p className="tabular text-navy-900" dir="ltr">{phone}</p>
                  )}
                  {customer.email && (
                    <p className="text-sand-700" dir="ltr">{customer.email}</p>
                  )}
                  {phone && (
                    <div className="flex flex-wrap gap-2">
                      <a href={`tel:${phone}`}
                         className="inline-flex items-center gap-1.5 rounded-[--radius-md]
                                    border border-sand-300 px-3 py-2 text-[13px] font-bold
                                    text-navy-700 hover:border-nile-500">
                        <Phone size={14} /> اتصال
                      </a>
                      <a href={`https://wa.me/${waNumber}`} target="_blank"
                         rel="noopener noreferrer"
                         className="inline-flex items-center gap-1.5 rounded-[--radius-md]
                                    border border-sand-300 px-3 py-2 text-[13px] font-bold
                                    text-navy-700 hover:border-nile-500">
                        <MessageCircle size={14} /> واتساب
                      </a>
                    </div>
                  )}
                  <p className="border-t border-sand-200 pt-3 text-xs text-sand-600">
                    الموافقة التسويقية:{' '}
                    <span className="font-bold text-navy-700">
                      {customer.marketing_consent ? 'موافق' : 'غير موافق'}
                    </span>
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="ملاحظات" />
            <div className="p-5">
              <CustomerNote storeId={membership.storeId} customerId={customer.id}
                            initial={customer.notes ?? ''}
                            canEdit={can(membership, 'customers:update')} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
