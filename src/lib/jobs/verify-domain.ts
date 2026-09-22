import 'server-only';
import { promises as dns } from 'node:dns';
import { createServiceClient } from '@/lib/supabase/service';
import { rpc, firstRow } from '@/lib/supabase/rpc';

/**
 * التحقق من ملكية دومين عبر سجل TXT.
 *
 * ★ لماذا هنا وليس في Server Action عادي؟
 * قراءة الـDNS لا تتم داخل PostgreSQL، ونتيجتها هي الدليل الوحيد على
 * الملكية. لو استقبلت دالةُ القاعدة «سجلات TXT» من العميل لصار إثبات
 * ملكية أي دومين مجرد إرسال نص. لذلك:
 *   * `verify_domain` ممنوحة لـservice_role فقط (0021).
 *   * القراءة تتم هنا بـnode:dns، والنتيجة الحقيقية وحدها تُمرَّر.
 *   * الصلاحية على المتجر تُفحص في المستدعي قبل تشغيل هذه الوظيفة.
 *
 * هذه الوحدة لا تُستدعى من المتصفح ولا تُصدَّر كـServer Action.
 */

export type VerifyOutcome =
  | { ok: true; verified: boolean; reason: string | null }
  | { ok: false; reason: string };

const LOOKUP_TIMEOUT_MS = 5000;

/** يقرأ سجلات TXT لاسم المضيف، ويعيد مصفوفة فارغة إن لم توجد. */
async function readTxt(hostname: string): Promise<string[]> {
  const resolver = new dns.Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 2 });
  const records = await resolver.resolveTxt(hostname);
  // كل سجل مقسوم إلى أجزاء ≤255 بايت — تُلصق قبل المقارنة
  return records.map((chunks) => chunks.join(''));
}

export async function verifyDomainOwnership(input: {
  domainId: string; hostname: string;
}): Promise<VerifyOutcome> {
  let records: string[];
  try {
    // التوكن يُنشر على `_nile-market.<host>` لا على الجذر: سجل TXT على
    // الجذر قد يكون محجوزًا لـSPF أو غيره، وتعديله يكسر بريد التاجر.
    records = await readTxt(`_nile-market.${input.hostname}`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      records = [];
    } else {
      console.error('[domains] فشل استعلام DNS', { hostname: input.hostname, code });
      return { ok: false, reason: 'تعذّر الاستعلام عن سجلات DNS — حاول بعد قليل' };
    }
  }

  const supabase = createServiceClient();
  const { data, error } = await rpc(supabase, 'verify_domain', {
    p_domain_id: input.domainId,
    p_txt_records: records,
  });
  if (error) {
    console.error('[domains] فشل تسجيل نتيجة التحقق', { error: error.message });
    return { ok: false, reason: 'تعذّر حفظ نتيجة التحقق' };
  }

  const row = firstRow(data);
  if (!row) return { ok: false, reason: 'تعذّر حفظ نتيجة التحقق' };

  return { ok: true, verified: row.verified, reason: row.reason };
}
