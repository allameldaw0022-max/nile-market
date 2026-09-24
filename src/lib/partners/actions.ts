'use server';
import 'server-only';
import { requirePartner } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { config } from '@/lib/config';

/**
 * لوحة الشريك.
 *
 * ★ عزل البيانات: الشريك يرى عدد إحالاته وعمولاته فقط. لا يرى طلبات
 * التاجر ولا عملاءه ولا إيراداته — سياسات RLS في 0010 تمنع ذلك،
 * وهذه الاستعلامات لا تطلبها أصلًا.
 *
 * ★ نسبة العمولة تُقرأ ولا تُكتب من هنا: تغييرها بيد Admin وبأثر
 * مستقبلي (D20).
 */

export type PartnerProfile = {
  partnerId: string; name: string; referralCode: string;
  commissionRate: number; status: string; referralUrl: string;
};

export type PartnerBalance = { payable: number; paid: number; total: number };

export type ReferralRow = {
  id: string; storeName: string | null; attributionSource: string;
  createdAt: string;
  planName: string | null; subscriptionStatus: string | null;
  periodEnd: string | null;
  /** عدد دفعات الاشتراك المؤكَّدة — الاشتراك الأول وكل تجديد بعده. */
  paidSubscriptions: number;
  lastPaidAt: string | null;
  commissionTotal: number;
  commissionPayable: number;
};

export type CommissionRow = {
  id: string; entryKind: string; amount: number; baseAmount: number;
  rateApplied: number; status: string; createdAt: string;
};

export type PayoutRow = {
  id: string; amount: number; status: string; note: string | null;
  createdAt: string; paidAt: string | null; rejectedReason: string | null;
};

export async function loadPartnerDashboard(): Promise<ActionResult<{
  profile: PartnerProfile;
  balance: PartnerBalance;
  pendingPayouts: number;
  referrals: ReferralRow[];
  commissions: CommissionRow[];
  payouts: PayoutRow[];
}>> {
  try {
    const { partnerId } = await requirePartner();
    const supabase = await createClient();

    const [{ data: partner }, { data: balance }, { data: referredStores },
           { data: commissions }, { data: payouts }] = await Promise.all([
      supabase.from('partners')
        .select('id, name, referral_code, commission_rate, status')
        .eq('id', partnerId).maybeSingle(),
      supabase.from('partner_balances')
        .select('payable, paid, total').eq('partner_id', partnerId).maybeSingle(),
      // ★ دالة واحدة تخدم لوحة المسوّق ولوحة الإدارة: بلا وسيط تعيد
      // تجار المسوّق الحالي وحده (`app.current_partner_id()`).
      rpc(supabase, 'partner_referred_stores', { p_partner_id: null }),
      supabase.from('commission_ledger')
        .select('id, entry_kind, amount, base_amount, rate_applied, status, created_at')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('partner_payouts')
        .select('id, amount, status, note, created_at, paid_at, rejected_reason')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false }).limit(20),
    ]);

    if (!partner) throw errors.notFound();

    const payoutRows = (payouts ?? []).map((p) => ({
      id: p.id, amount: Number(p.amount), status: p.status, note: p.note,
      createdAt: p.created_at, paidAt: p.paid_at,
      rejectedReason: p.rejected_reason,
    }));

    return ok({
      profile: {
        partnerId: partner.id,
        name: partner.name,
        referralCode: partner.referral_code,
        commissionRate: Number(partner.commission_rate),
        status: partner.status,
        referralUrl: `${config.siteUrl}/?ref=${partner.referral_code}`,
      },
      balance: {
        payable: Number(balance?.payable ?? 0),
        paid: Number(balance?.paid ?? 0),
        total: Number(balance?.total ?? 0),
      },
      // المعلّق محجوز من الرصيد — نفس ما تحسبه القاعدة عند الطلب
      pendingPayouts: payoutRows
        .filter((p) => p.status === 'submitted' || p.status === 'approved')
        .reduce((sum, p) => sum + p.amount, 0),
      referrals: (referredStores ?? []).map((r) => ({
        id: r.store_id,
        storeName: r.store_name,
        attributionSource: r.attribution_source,
        createdAt: r.attributed_at,
        planName: r.plan_name,
        subscriptionStatus: r.subscription_status,
        periodEnd: r.current_period_end,
        paidSubscriptions: Number(r.paid_subscriptions),
        lastPaidAt: r.last_paid_at,
        commissionTotal: Number(r.commission_total),
        commissionPayable: Number(r.commission_payable),
      })),
      commissions: (commissions ?? []).map((c) => ({
        id: c.id, entryKind: c.entry_kind, amount: Number(c.amount),
        baseAmount: Number(c.base_amount), rateApplied: Number(c.rate_applied),
        status: c.status, createdAt: c.created_at,
      })),
      payouts: payoutRows,
    });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * طلب صرف.
 * المبلغ يُقاس في القاعدة على الرصيد المستحق ناقص ما هو محجوز في
 * طلبات معلّقة — فلا يُصرف نفس الرصيد مرتين (D30).
 */
export async function requestPayout(input: {
  amount: number; note?: string; idempotencyKey: string;
}): Promise<ActionResult<{ payoutId: string; amount: number }>> {
  try {
    await requirePartner();
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw errors.validation('أدخل مبلغًا أكبر من صفر', 'amount');
    if (!input.idempotencyKey) throw errors.validation('مفتاح الطلب مفقود');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'request_partner_payout', {
      p_amount: input.amount,
      p_note: input.note?.trim() || null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    return ok({ payoutId: row.payout_id, amount: Number(row.amount) });
  } catch (err) {
    return actionError(err);
  }
}
