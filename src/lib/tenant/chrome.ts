import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';

export type StoreChrome = {
  /** من `stores` */
  logoUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  /** من `store_settings` */
  whatsapp: string | null;
  contactPhone: string | null;
  theme: Record<string, unknown> | null;
  codEnabled: boolean;
  bankTransferEnabled: boolean;
  bankakEnabled: boolean;
  /** تصنيفات المتجر — يقتطع كل مستهلك ما يعرضه (التنقّل ٨، الصفحة ٢٤) */
  categories: { id: string; name: string; slug: string }[];
};

const EMPTY: StoreChrome = {
  logoUrl: null, bannerUrl: null, description: null,
  whatsapp: null, contactPhone: null, theme: null,
  codEnabled: false, bankTransferEnabled: true, bankakEnabled: false,
  categories: [],
};

/**
 * ★ «قشرة المتجر»: الهوية والإعدادات المعلنة والتصنيفات.
 *
 * كانت هذه البيانات تُجلب مرّتين في كل صفحة متجر — مرّة في التخطيط
 * (الشعار وواتساب وتصنيفات التنقّل) ومرّة في الصفحة (الوصف وطرق
 * الدفع والتصنيفات نفسها). قياسٌ فعلي على الصفحة الرئيسية: عشرة
 * نداءات، أربعة منها تكرار حرفيّ.
 *
 * وهي بيانات **عامة** لا تخصّ زائرًا بعينه ولا تتغيّر إلا حين
 * يعدّلها التاجر، فتُجلب مرّة واحدة وتُخزَّن:
 *   · `cache` من React ⇒ نداء واحد داخل الطلب الواحد مهما تكرّر.
 *   · `unstable_cache` ⇒ لا نداء أصلًا بين الطلبات، حتى يُبطِلها
 *     وسم `store:<id>:settings` أو `store:<id>:products` — وهما
 *     الوسمان اللذان تُطلقهما أفعال الإعدادات والمنتجات القائمة.
 *
 * ★ عميل بلا كوكيز: النتيجة مشتركة بين كل الزوّار، فلا يجوز أن
 * تلمس جلسة مستخدم بعينه — وهي القاعدة نفسها في `resolve.ts`.
 */
export const storeChrome = cache(async (storeId: string): Promise<StoreChrome> => {
  const load = unstable_cache(
    async (): Promise<StoreChrome> => {
      const supabase = createPublicClient();
      const [brandRes, settingsRes, catsRes] = await Promise.all([
        supabase.from('stores')
          .select('logo_url, banner_url, description')
          .eq('id', storeId).maybeSingle(),
        supabase.from('store_settings')
          // ★ النصّ حرفيًا لا مركَّبًا: التركيب يُفقد Supabase استدلال
          // الأنواع فتعود `GenericStringError` بدل الصفّ.
          .select('whatsapp_number, contact_phone, theme, cod_enabled, bank_transfer_enabled, bankak_enabled')
          .eq('store_id', storeId).maybeSingle(),
        supabase.from('categories')
          .select('id, name, slug')
          .eq('store_id', storeId).eq('is_active', true).is('deleted_at', null)
          .order('sort_order').limit(24),
      ]);

      const brand = brandRes.data;
      const settings = settingsRes.data;
      return {
        logoUrl: brand?.logo_url ?? null,
        bannerUrl: brand?.banner_url ?? null,
        description: brand?.description ?? null,
        whatsapp: settings?.whatsapp_number ?? null,
        contactPhone: settings?.contact_phone ?? null,
        theme: (settings?.theme ?? null) as Record<string, unknown> | null,
        codEnabled: settings?.cod_enabled ?? false,
        bankTransferEnabled: settings?.bank_transfer_enabled ?? true,
        bankakEnabled: settings?.bankak_enabled ?? false,
        categories: catsRes.data ?? [],
      };
    },
    ['store-chrome', storeId],
    {
      revalidate: 300,
      tags: [storeTag(storeId, 'settings'), storeTag(storeId, 'products')],
    },
  );

  try {
    return await load();
  } catch (error) {
    // يفشل مفتوحًا لا مغلقًا: قشرة ناقصة أهون من متجر لا يُفتح
    console.error('[tenant] تعذّر تحميل قشرة المتجر', { storeId, error });
    return EMPTY;
  }
});
