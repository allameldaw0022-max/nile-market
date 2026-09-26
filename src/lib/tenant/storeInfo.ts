import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';

/**
 * بيانات المتجر المعلنة لصفحتي «تواصل معنا» والسياسات.
 *
 * ★ مفصولة عن `storeChrome` عن قصد: القشرة تُقرأ في **كل** صفحة
 * متجر، والسياسات نصوصٌ قد تبلغ كيلوبايتات ولا تُقرأ إلا في صفحتين
 * قليلتي الحركة. ضمّها للقشرة كان سيحمّل كل صفحة ما لا تعرضه.
 *
 * ★ عميل بلا كوكيز + تخزين: هذه بيانات معلنة واحدة لكل الزوّار،
 * وكان جلبها بعميل الجلسة يُخرج الصفحتين من التخزين — وقد ظهر ذلك
 * خطأً صريحًا (`DYNAMIC_SERVER_USAGE`) لا تسريبًا صامتًا، وهو
 * السلوك الصحيح.
 */
export type StoreInfo = {
  whatsapp: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: { city?: string; line?: string };
  socialLinks: Record<string, string>;
  policies: Record<string, string | undefined>;
};

const EMPTY: StoreInfo = {
  whatsapp: null, contactPhone: null, contactEmail: null,
  address: {}, socialLinks: {}, policies: {},
};

export async function storeInfo(storeId: string): Promise<StoreInfo> {
  const load = unstable_cache(
    async (): Promise<StoreInfo> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from('store_settings')
        .select('whatsapp_number, contact_phone, contact_email, address, social_links, policies')
        .eq('store_id', storeId).maybeSingle();
      if (!data) return EMPTY;
      return {
        whatsapp: data.whatsapp_number ?? null,
        contactPhone: data.contact_phone ?? null,
        contactEmail: data.contact_email ?? null,
        address: (data.address ?? {}) as StoreInfo['address'],
        socialLinks: (data.social_links ?? {}) as StoreInfo['socialLinks'],
        policies: (data.policies ?? {}) as StoreInfo['policies'],
      };
    },
    ['store-info', storeId],
    { revalidate: 300, tags: [storeTag(storeId, 'settings')] },
  );
  // يفشل مفتوحًا: صفحة تواصل ناقصة أهون من صفحة لا تُفتح
  try { return await load(); } catch { return EMPTY; }
}
