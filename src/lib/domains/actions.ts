'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag, tenantTag } from '@/lib/tenant/resolve';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { verifyDomainOwnership } from '@/lib/jobs/verify-domain';

export type StoreDomain = {
  id: string;
  hostname: string;
  kind: 'subdomain' | 'custom';
  status: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  failureReason: string | null;
};

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]{1,251}[a-z0-9])?$/;

export async function listStoreDomains(
  storeId: string,
): Promise<ActionResult<StoreDomain[]>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'settings:view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('store_domains')
      .select('id, hostname, kind, status, is_primary, verification_token, verified_at, last_checked_at, failure_reason')
      .eq('store_id', membership.storeId)
      .order('kind').order('created_at');
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((d) => ({
      id: d.id,
      hostname: d.hostname,
      kind: d.kind as 'subdomain' | 'custom',
      status: d.status,
      isPrimary: d.is_primary,
      verificationToken: d.verification_token,
      verifiedAt: d.verified_at,
      lastCheckedAt: d.last_checked_at,
      failureReason: d.failure_reason,
    })));
  } catch (err) {
    return actionError(err);
  }
}

export async function addCustomDomain(input: {
  storeId: string; hostname: string;
}): Promise<ActionResult<{ domainId: string; token: string }>> {
  try {
    const hostname = input.hostname.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!HOSTNAME_RE.test(hostname) || !hostname.includes('.'))
      throw errors.validation('أدخل دومينًا صحيحًا، مثال: shop.example.com', 'hostname');

    const { membership } = await requireStoreAccess(input.storeId, 'domain:manage');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'add_custom_domain', {
      p_store_id: membership.storeId, p_hostname: hostname,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'settings'));
    return ok({ domainId: row.domain_id, token: row.verification_token });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * يشغّل التحقق من الـDNS.
 *
 * الصلاحية تُفحص هنا أولًا؛ قراءة الـDNS وتسجيل النتيجة يتمان في
 * وظيفة النظام، لأن `verify_domain` غير ممنوحة للعميل إطلاقًا —
 * وإلا لأمكن «إثبات» ملكية أي دومين بإرسال نص.
 */
export async function checkDomainVerification(input: {
  storeId: string; domainId: string;
}): Promise<ActionResult<{ verified: boolean; reason: string | null }>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'domain:manage');
    const supabase = await createClient();

    const { data: domain, error } = await supabase
      .from('store_domains').select('id, hostname, kind')
      .eq('id', input.domainId).eq('store_id', membership.storeId)
      .maybeSingle();
    if (error) throw fromPostgres(error);
    if (!domain) throw errors.notFound();
    if (domain.kind !== 'custom')
      throw errors.validation('النطاق الفرعي لا يحتاج تحققًا');

    const outcome = await verifyDomainOwnership({
      domainId: domain.id, hostname: domain.hostname,
    });
    if (!outcome.ok) throw errors.validation(outcome.reason);

    updateTag(tenantTag(domain.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));
    return ok({ verified: outcome.verified, reason: outcome.reason });
  } catch (err) {
    return actionError(err);
  }
}

export async function setPrimaryDomain(input: {
  storeId: string; domainId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'domain:manage');
    const supabase = await createClient();

    const { data: domains } = await supabase
      .from('store_domains').select('hostname')
      .eq('store_id', membership.storeId);

    const { error } = await rpc(supabase, 'set_primary_domain', {
      p_domain_id: input.domainId,
    });
    if (error) throw fromPostgres(error);

    // كل مضيفات المتجر تُبطَل: الـcanonical تغيّر على جميع صفحاته
    for (const d of domains ?? []) updateTag(tenantTag(d.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function removeCustomDomain(input: {
  storeId: string; domainId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'domain:manage');
    const supabase = await createClient();

    const { data: domains } = await supabase
      .from('store_domains').select('hostname')
      .eq('store_id', membership.storeId);

    const { error } = await rpc(supabase, 'remove_custom_domain', {
      p_domain_id: input.domainId,
    });
    if (error) throw fromPostgres(error);

    for (const d of domains ?? []) updateTag(tenantTag(d.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
