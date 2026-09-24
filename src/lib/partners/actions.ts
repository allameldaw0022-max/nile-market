'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requirePartner, requireUser } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { partnerLegacyLink, partnerShortLink } from './links';

/**
 * لوحة الشريك.
 *
 * ★ عزل البيانات: الشريك يرى إحالاته وعمولاته ومستحقاته فقط. لا
 * يرى طلبات التاجر ولا عملاءه ولا إيراداته — سياسات RLS في 0010
 * تمنع ذلك، والدوال هنا لا تقبل معرّف شريك آخر أصلًا.
 *
 * ★ لا رقم يُكتب من هنا: النسبة تُقرأ ولا تُكتب (بيد Admin)، ومبلغ
 * الصرف تحسبه القاعدة من العمولات المتاحة وتحجزها في نفس المعاملة.
 */

export type PartnerProfile = {
  partnerId: string; name: string; referralCode: string; serialNo: number | null;
  commissionRate: number; status: string;
  shortLink: string | null; legacyLink: string;
};

export type PartnerBalance = {
  payable: number; reserved: number; paid: number; total: number;
};

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
  id: string; storeName: string; planName: string | null;
  entryKind: string; amount: number; baseAmount: number;
  rateApplied: number; status: string; paidAt: string | null; createdAt: string;
};

export type PayoutRow = {
  id: string; amount: number; status: string; note: string | null;
  createdAt: string; paidAt: string | null; transferredAt: string | null;
  reference: string | null; rejectedReason: string | null;
  commissionCount: number;
};

export type PayoutAccount = {
  method: 'bank_transfer' | 'bankak' | null;
  beneficiary: string | null; bank: string | null;
  account: string | null; phone: string | null;
  isComplete: boolean;
};

type SelfRow = {
  partner_id: string; name: string; referral_code: string;
  serial_no: number | null; commission_rate: number; status: string;
  payable: number; reserved: number; paid: number; total: number;
  account_ready: boolean;
};

/** ملف الشريك ورصيده — نداء واحد يفحص الهوية في القاعدة. */
async function readSelf(): Promise<SelfRow> {
  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'partner_self', {});
  if (error) throw fromPostgres(error);
  const row = firstRow(data);
  if (!row) throw errors.notFound();
  return row;
}

function toProfile(row: SelfRow): PartnerProfile {
  const serial = row.serial_no === null ? null : Number(row.serial_no);
  return {
    partnerId: row.partner_id,
    name: row.name,
    referralCode: row.referral_code,
    serialNo: serial,
    commissionRate: Number(row.commission_rate),
    status: row.status,
    shortLink: partnerShortLink(serial),
    legacyLink: partnerLegacyLink(row.referral_code),
  };
}

function toBalance(row: SelfRow): PartnerBalance {
  return {
    payable: Number(row.payable),
    reserved: Number(row.reserved),
    paid: Number(row.paid),
    total: Number(row.total),
  };
}

/** الصفحة الرئيسية للشريك. */
export async function loadPartnerDashboard(): Promise<ActionResult<{
  profile: PartnerProfile;
  balance: PartnerBalance;
  referrals: ReferralRow[];
  payouts: PayoutRow[];
  accountReady: boolean;
}>> {
  try {
    await requirePartner();
    const supabase = await createClient();

    const [self, { data: stores }, { data: payouts }] = await Promise.all([
      readSelf(),
      // دالة واحدة تخدم الشريك والإدارة — بلا وسيط تعيد بيانات المنادي
      rpc(supabase, 'partner_referred_stores', { p_partner_id: null }),
      rpc(supabase, 'partner_payout_rows', { p_partner_id: null, p_limit: 20 }),
    ]);

    return ok({
      profile: toProfile(self),
      balance: toBalance(self),
      referrals: (stores ?? []).map(mapReferral),
      payouts: (payouts ?? []).map(mapPayout),
      accountReady: self.account_ready,
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function loadPartnerCommissions(): Promise<ActionResult<{
  rows: CommissionRow[]; rate: number;
}>> {
  try {
    await requirePartner();
    const supabase = await createClient();

    const [self, { data, error }] = await Promise.all([
      readSelf(),
      rpc(supabase, 'partner_commission_rows', { p_partner_id: null, p_limit: 200 }),
    ]);
    if (error) throw fromPostgres(error);

    return ok({
      rate: Number(self.commission_rate),
      rows: (data ?? []).map((c) => ({
        id: c.commission_id,
        storeName: c.store_name,
        planName: c.plan_name,
        entryKind: c.entry_kind,
        amount: Number(c.amount),
        baseAmount: Number(c.base_amount),
        rateApplied: Number(c.rate_applied),
        status: c.status,
        paidAt: c.paid_at,
        createdAt: c.created_at,
      })),
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function loadPartnerPayouts(): Promise<ActionResult<{
  balance: PartnerBalance; payouts: PayoutRow[]; account: PayoutAccount;
}>> {
  try {
    await requirePartner();
    const supabase = await createClient();

    const [self, { data: payouts }, { data: account }] = await Promise.all([
      readSelf(),
      rpc(supabase, 'partner_payout_rows', { p_partner_id: null, p_limit: 50 }),
      rpc(supabase, 'partner_payout_account', {}),
    ]);

    return ok({
      balance: toBalance(self),
      payouts: (payouts ?? []).map(mapPayout),
      account: mapAccount(firstRow(account)),
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function loadPartnerAccount(): Promise<ActionResult<PayoutAccount>> {
  try {
    await requirePartner();
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'partner_payout_account', {});
    if (error) throw fromPostgres(error);
    return ok(mapAccount(firstRow(data)));
  } catch (err) {
    return actionError(err);
  }
}

/** بيانات استلام الأرباح — يكتبها الشريك لنفسه، والقاعدة تتحقق. */
export async function savePayoutAccount(input: {
  method: 'bank_transfer' | 'bankak';
  beneficiary: string; bank?: string; account?: string; phone?: string;
}): Promise<ActionResult> {
  try {
    await requirePartner();
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'save_partner_payout_account', {
      p_method: input.method,
      p_beneficiary: input.beneficiary.trim(),
      p_bank: input.bank?.trim() || null,
      p_account: input.account?.replace(/\s/g, '') || null,
      p_phone: input.phone?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/partner/settings');
    revalidatePath('/partner/payouts');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * طلب صرف المستحقات.
 *
 * ★ بلا مبلغ. القاعدة تقفل العمولات المتاحة، تجمعها، تُنشئ الطلب،
 * تربطها به وتوسمها محجوزة — في معاملة واحدة. ضغطتان متزامنتان
 * تُنتجان طلبًا واحدًا لأن صفّ الشريك يُقفل أولًا، لا لأن الزرّ
 * عُطِّل في المتصفح.
 */
export async function requestPayout(input: {
  note?: string; idempotencyKey: string;
}): Promise<ActionResult<{ payoutId: string; amount: number; count: number }>> {
  try {
    await requirePartner();
    if (!input.idempotencyKey) throw errors.validation('مفتاح الطلب مفقود');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'request_partner_payout', {
      p_note: input.note?.trim() || null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    revalidatePath('/partner');
    revalidatePath('/partner/payouts');
    return ok({
      payoutId: row.payout_id,
      amount: Number(row.amount),
      count: Number(row.commission_count),
    });
  } catch (err) {
    return actionError(err);
  }
}

/** سحب طلب لم تبدأ معالجته — العمولات تعود متاحة. */
export async function cancelPayout(payoutId: string): Promise<ActionResult> {
  try {
    await requirePartner();
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'cancel_partner_payout', {
      p_payout_id: payoutId,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/partner');
    revalidatePath('/partner/payouts');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * التسجيل كشريك لحساب قائم.
 *
 * ★ لا نظام مصادقة جديد: الحساب يُنشأ بـSupabase Auth (بريد أو
 * Google)، وهذه تُنشئ ملف الشريك له. النسبة من إعدادات المنصة.
 */
export async function becomePartner(): Promise<ActionResult<{
  partnerId: string; referralCode: string; serialNo: number | null;
  created: boolean;
}>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'become_partner', {});
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    return ok({
      partnerId: row.partner_id,
      referralCode: row.referral_code,
      serialNo: row.serial_no === null ? null : Number(row.serial_no),
      created: row.was_created,
    });
  } catch (err) {
    return actionError(err);
  }
}

// ── محوّلات ──────────────────────────────────────────────────────

function mapReferral(r: {
  store_id: string; store_name: string; attribution_source: string;
  attributed_at: string; plan_name: string | null;
  subscription_status: string | null; current_period_end: string | null;
  paid_subscriptions: number; last_paid_at: string | null;
  commission_total: number; commission_payable: number;
}): ReferralRow {
  return {
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
  };
}

function mapPayout(p: {
  payout_id: string; amount: number; status: string; note: string | null;
  created_at: string; paid_at: string | null; transferred_at: string | null;
  reference: string | null; rejected_reason: string | null;
  commission_count: number;
}): PayoutRow {
  return {
    id: p.payout_id,
    amount: Number(p.amount),
    status: p.status,
    note: p.note,
    createdAt: p.created_at,
    paidAt: p.paid_at,
    transferredAt: p.transferred_at,
    reference: p.reference,
    rejectedReason: p.rejected_reason,
    commissionCount: Number(p.commission_count),
  };
}

function mapAccount(a: {
  method: string | null; beneficiary: string | null; bank: string | null;
  account: string | null; phone: string | null; is_complete: boolean;
} | null): PayoutAccount {
  return {
    method: a?.method === 'bank_transfer' || a?.method === 'bankak' ? a.method : null,
    beneficiary: a?.beneficiary ?? null,
    bank: a?.bank ?? null,
    account: a?.account ?? null,
    phone: a?.phone ?? null,
    isComplete: a?.is_complete ?? false,
  };
}
