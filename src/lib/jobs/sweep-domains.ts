import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyDomainOwnership } from '@/lib/jobs/verify-domain';
import { log } from '@/lib/observability/logger';
import { rpc } from '@/lib/supabase/rpc';

/**
 * كنس الدومينات المنتظرة.
 *
 * ★ انتشار الـDNS يستغرق ساعات، والتاجر لا يجلس أمام الشاشة ينتظر.
 * بدون هذا الكنس كان الدومين يبقى «منتظرًا» حتى يعود التاجر ويضغط —
 * وكثير منهم لا يعود.
 *
 * ★ التباعد في القاعدة لا هنا: `claim_pending_domains` تختار المستحقّ
 * وتختم وقت الفحص في معاملة واحدة مع `skip locked`، فتشغيلان
 * متزامنان لا يفحصان الدومين نفسه مرّتين.
 *
 * ★ فشل دومين لا يوقف البقية: كل واحد في محاولته الخاصة.
 */
export async function sweepPendingDomains(limit = 20): Promise<{
  ok: boolean; checked: number; verified: number; error?: string;
}> {
  const supabase = createServiceClient();

  const { data, error } = await rpc(supabase, 'claim_pending_domains', {
    p_limit: limit,
  });
  if (error) {
    log.error('domains.claim_failed', { reason: error.message });
    return { ok: false, checked: 0, verified: 0, error: error.message };
  }

  const domains = data ?? [];
  let verified = 0;

  for (const domain of domains) {
    try {
      const outcome = await verifyDomainOwnership({
        domainId: domain.domain_id, hostname: domain.hostname,
      });
      if (outcome.ok && outcome.verified) {
        verified += 1;
        // التنبيه من هنا لا من `verify_domain`: الدالة تُنادى أيضًا
        // بضغطة التاجر وهو ينظر إلى النتيجة، فلا داعي لتنبيهه بما يراه.
        await rpc(supabase, 'notify_domain_verified', {
          p_domain_id: domain.domain_id,
        });
      }
      log.info('domains.checked', {
        store_id: domain.store_id,
        verified: outcome.ok ? outcome.verified : false,
      });
    } catch (err) {
      log.warn('domains.check_failed', {
        store_id: domain.store_id,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return { ok: true, checked: domains.length, verified };
}
