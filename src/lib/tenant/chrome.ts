import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';

/** قالب واجهة المتجر. `classic` هو الافتراضي بحكم عمود القاعدة. */
export type StorefrontTemplate = 'classic' | 'digital';

/** بنر يعرضه القالب الرقمي — صورته إمّا للمتجر أو من مكتبة المنصّة. */
export type ThemeBanner = {
  id: string;
  slot: 'hero' | 'promo';
  title: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  bucket: string | null;
  path: string | null;
  blur: string | null;
};

/**
 * أقسام الصفحة الرئيسية للقالب الرقمي.
 *
 * ★ الترتيب **ليس** هنا: هو ثابت في المكوّن ولا يملكه التاجر. وما
 * يملكه إظهارُ القسم أو إخفاؤه — وهذا كل ما تحمله هذه الخريطة.
 */
export type SectionFlags = {
  hero: boolean; promo: boolean; categories: boolean;
  featured: boolean; offers: boolean;
};

export const DEFAULT_SECTIONS: SectionFlags = {
  hero: true, promo: true, categories: true, featured: true, offers: true,
};

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
  /**
   * تصنيفات المتجر — يقتطع كل مستهلك ما يعرضه (التنقّل ٨، الصفحة ٢٤).
   *
   * ★ `productCount` هنا لا في استعلامٍ لكل بطاقة: القالب الرقمي يُخفي
   * التصنيف الفارغ، وعدّادٌ لكل تصنيف كان سيعني استعلامًا لكل بطاقة
   * في كل طلب. و`image` تأتي من `categories.image_id` القائم.
   */
  categories: {
    id: string; name: string; slug: string;
    productCount: number;
    image: { bucket: string; path: string; blur: string | null } | null;
  }[];
  /** ★ القالب — يفرّع عليه التخطيط والصفحة بلا استعلام إضافي. */
  template: StorefrontTemplate;
  /** بنرات القالب الرقمي (تبقى محفوظة وغير مستخدمة في `classic`). */
  banners: ThemeBanner[];
  /** إظهار/إخفاء أقسام الصفحة الرئيسية — لا ترتيبها. */
  sections: SectionFlags;
};

const EMPTY: StoreChrome = {
  logoUrl: null, bannerUrl: null, description: null,
  whatsapp: null, contactPhone: null, theme: null,
  codEnabled: false, bankTransferEnabled: true, bankakEnabled: false,
  categories: [],
  // ★ يفشل مفتوحًا إلى `classic`: قشرةٌ ناقصة لا يجوز أن تُحوّل متجر
  // تاجرٍ إلى قالب آخر أمام زبائنه.
  template: 'classic',
  banners: [],
  sections: DEFAULT_SECTIONS,
};

/** أعلام الأقسام من `store_settings.theme` — ما لم يُضبط ظاهرٌ. */
function readSections(theme: Record<string, unknown> | null): SectionFlags {
  const raw = theme?.sections;
  if (raw == null || typeof raw !== 'object') return DEFAULT_SECTIONS;
  const map = raw as Record<string, unknown>;
  const on = (k: keyof SectionFlags) => map[k] !== false;
  return {
    hero: on('hero'), promo: on('promo'), categories: on('categories'),
    featured: on('featured'), offers: on('offers'),
  };
}

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
      // ★★ أربعة استعلامات متوازية لا أكثر، ولكل قسمٍ جديد **صفر**
      // استعلام إضافي: صور التصنيفات وعدّاد منتجاتها مضمَّنة في
      // استعلام التصنيفات نفسه، والبنرات استعلامٌ واحد لكلّها.
      const [brandRes, settingsRes, catsRes, bannersRes] = await Promise.all([
        supabase.from('stores')
          .select('logo_url, banner_url, description')
          .eq('id', storeId).maybeSingle(),
        supabase.from('store_settings')
          // ★ النصّ حرفيًا لا مركَّبًا: التركيب يُفقد Supabase استدلال
          // الأنواع فتعود `GenericStringError` بدل الصفّ.
          .select('whatsapp_number, contact_phone, theme, cod_enabled, bank_transfer_enabled, bankak_enabled, storefront_template')
          .eq('store_id', storeId).maybeSingle(),
        supabase.from('categories')
          .select('id, name, slug, media_files(bucket, path, blur_data_url), products(count)')
          .eq('store_id', storeId).eq('is_active', true).is('deleted_at', null)
          .order('sort_order').limit(24),
        supabase.from('store_theme_banners')
          .select('id, slot, title, description, cta_label, cta_href, media_files(bucket, path, blur_data_url)')
          .eq('store_id', storeId).eq('is_visible', true).is('deleted_at', null)
          .order('sort_order').limit(12),
      ]);

      const brand = brandRes.data;
      const settings = settingsRes.data;
      const themeJson = (settings?.theme ?? null) as Record<string, unknown> | null;

      type CatRow = {
        id: string; name: string; slug: string;
        media_files: { bucket: string; path: string; blur_data_url: string | null } | null;
        products: { count: number }[] | null;
      };
      type BannerRow = {
        id: string; slot: string; title: string | null; description: string | null;
        cta_label: string | null; cta_href: string | null;
        media_files: { bucket: string; path: string; blur_data_url: string | null } | null;
      };

      const cats = (catsRes.data ?? []) as unknown as CatRow[];
      const banners = (bannersRes.data ?? []) as unknown as BannerRow[];

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
        categories: cats.map((c) => ({
          id: c.id, name: c.name, slug: c.slug,
          // ★ العدّاد يشمل كل منتجات التصنيف؛ الترشيح على «المتاح»
          //   يجري في الاستعلام نفسه أدناه لأنّ PostgREST لا يرشّح
          //   العلاقة المضمَّنة في العدّ. فالصفر يعني «لا منتج» يقينًا.
          productCount: c.products?.[0]?.count ?? 0,
          image: c.media_files
            ? { bucket: c.media_files.bucket, path: c.media_files.path,
                blur: c.media_files.blur_data_url }
            : null,
        })),
        template: settings?.storefront_template === 'digital' ? 'digital' : 'classic',
        banners: banners.map((b) => ({
          id: b.id,
          slot: b.slot === 'promo' ? 'promo' : 'hero',
          title: b.title, description: b.description,
          ctaLabel: b.cta_label, ctaHref: b.cta_href,
          bucket: b.media_files?.bucket ?? null,
          path: b.media_files?.path ?? null,
          blur: b.media_files?.blur_data_url ?? null,
        })),
        sections: readSections(themeJson),
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
