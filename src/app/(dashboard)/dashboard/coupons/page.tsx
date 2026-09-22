import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { CouponManager, type CouponRow } from '@/components/dashboard/CouponManager';

export const metadata: Metadata = { title: 'أكواد الخصم' };

export default async function CouponsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'orders:view');

  const supabase = await createClient();
  const { data } = await supabase
    .from('coupons')
    // سطر واحد عمدًا: PostgREST يستنتج شكل الصف من نص حرفي لا من تجميع
    .select('id, code, type, value, min_order_amount, max_discount_amount, starts_at, ends_at, usage_limit_total, usage_limit_per_customer, used_count, is_active')
    .eq('store_id', membership.storeId).is('deleted_at', null)
    .order('created_at', { ascending: false });

  const coupons: CouponRow[] = (data ?? []).map((c) => ({
    id: c.id, code: c.code, type: c.type as 'percentage' | 'fixed',
    value: Number(c.value),
    minOrderAmount: c.min_order_amount === null ? null : Number(c.min_order_amount),
    maxDiscountAmount: c.max_discount_amount === null ? null : Number(c.max_discount_amount),
    startsAt: c.starts_at, endsAt: c.ends_at,
    usageLimitTotal: c.usage_limit_total,
    usageLimitPerCustomer: c.usage_limit_per_customer,
    usedCount: c.used_count, isActive: c.is_active,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">أكواد الخصم</h1>
        <p className="text-sm text-sand-600">
          الخصم يُحسب في الخادم وقت الطلب — الكود لا يُطبَّق من المتصفح.
        </p>
      </div>

      <CouponManager storeId={membership.storeId} coupons={coupons}
                     canManage={can(membership, 'coupons:manage')} />
    </div>
  );
}
