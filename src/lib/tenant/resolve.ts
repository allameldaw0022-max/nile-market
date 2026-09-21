import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

export type StoreContext = {
  storeId: string;
  slug: string;
  name: string;
  status: 'draft' | 'pending_review' | 'active' | 'closed' | 'suspended';
  primaryHost: string;
  /** D14: انتهاء الاشتراك ⇒ المتجر مرئي والشراء معطّل. */
  canCheckout: boolean;
  isRedirect: boolean;
  domainStatus: string;
};

/**
 * ★ حل المستأجر — المسار **الوحيد** لاشتقاق المتجر.
 *
 * القاعدة غير القابلة للتفاوض: storeId يأتي من الـHost حصريًا، ولا
 * يُقبل من query ولا body ولا header في أي مسار من مسارات المتجر.
 * هذا هو جدار منع IDOR الأول قبل RLS.
 */
async function lookup(host: string): Promise<StoreContext | null> {
  // عميل بلا كوكيز: النتيجة عامة وقابلة للمشاركة بين كل الزوار،
  // ولا يجوز أن تلمس دالة مخزَّنة جلسةَ مستخدم بعينه.
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .rpc('resolve_store_by_host', { p_host: host })
    .maybeSingle();

  if (error) {
    console.error('[tenant] فشل حل المضيف', { host, error: error.message });
    return null;   // يفشل مغلقًا: لا متجر ⇒ 404
  }
  if (!data) return null;

  return {
    storeId: data.store_id,
    slug: data.slug,
    name: data.name,
    status: data.status,
    primaryHost: data.primary_host,
    canCheckout: data.can_checkout,
    isRedirect: data.is_redirect,
    domainStatus: data.domain_status,
  };
}

/**
 * مخزَّن 60 ثانية بوسم `tenant:<host>`.
 * يُبطَل فورًا عند تغيير الدومين أو حالة المتجر أو الاشتراك، حتى لا
 * يبقى متجر موقوف حيًا طوال مدة التخزين.
 */
export const resolveStoreByHost = cache(async (host: string) => {
  const normalized = host.toLowerCase().split(':')[0].trim();
  if (!normalized) return null;

  const cached = unstable_cache(
    () => lookup(normalized),
    ['tenant', normalized],
    { revalidate: 60, tags: [`tenant:${normalized}`] },
  );
  return cached();
});

export const tenantTag = (host: string) => `tenant:${host.toLowerCase()}`;
export const storeTag = (storeId: string, resource: string) =>
  `store:${storeId}:${resource}`;
