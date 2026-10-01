import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';
import type { StorefrontProduct } from '@/components/storefront/ProductCard';

/**
 * منتجات الصفحة الرئيسية — «الأحدث» و«العروض» من استعلام واحد.
 *
 * ★★ كانا استعلامين متوازيين يقرآن **نفس** الجدول بنفس المرشّحات
 * ونفس الترتيب، ويفترقان في شرط واحد (`compare_at_price is not null`)
 * وفي الحدّ. قياسٌ فعلي من اختبار الضغط: الرئيسية أثقل صفحة في
 * المتجر (سقفها المعزول ٩٥ طلبًا/ثانية مقابل ١٣٧ لصفحة كل المنتجات
 * و٢٥٠ للسلة)، وهي نقطة هبوط ١٠٠٪ من الجلسات.
 *
 * الآن صفحةٌ واحدة من أحدث ٢٤ منتجًا تُقرأ مرّة، ويُشتقّ منها
 * الجانبان محليًّا. وما يراه الزبون واحد: «الأحدث» أول ٨، و«العروض»
 * ما سعره المعتاد أعلى من سعره الحالي بحدّ ٤ — وهو نفس الاشتقاق
 * الذي كانت الصفحة تفعله على نتيجة الاستعلام الثاني.
 *
 * ★ حدّ ٢٤ لا ٨: العروض تُختار من بين آخر ٢٤ منتجًا. وهذا يضيّق
 * نافذة العروض مقارنةً بالاستعلام القديم الذي كان يبحث في المتجر
 * كلّه. مقبول لأنّ القسم «عروض حالية» لا «كل العروض»، ولأنّ الترتيب
 * كان بالأحدث في كلتا الحالتين — فالمعروض في الأعلى هو نفسه.
 *
 * ★ ما جُرِّب ورُفض: ترشيح الصور المضمّنة على `is_primary` لتقليل
 * الحمولة. البطاقة تتراجع إلى أول صورة حين لا تكون أيّ صورة
 * أساسية، فالترشيح كان سيُفرغ صور تلك المنتجات. مكسب حمولة مقابل
 * منتجات بلا صور — لا.
 *
 * ★ عميل بلا كوكيز + تخزين بوسم `store:<id>:products`: النتيجة
 * عامّة لكل الزوّار، وتعديل التاجر يُبطلها فورًا لا بعد دقيقة.
 */
export type HomeProducts = {
  latest: StorefrontProduct[];
  onSale: StorefrontProduct[];
};

const POOL = 24;
const LATEST = 8;
const DEALS = 4;

async function query(storeId: string): Promise<HomeProducts> {
  const supabase = createPublicClient();
  // ★ النصّ حرفيًا في الاستعلام: تمريره عبر ثابت يُفقد Supabase
  //   استدلال الأنواع فيعود `GenericStringError` بدل صفوف المنتجات.
  const { data } = await supabase
    .from('products')
    .select(
      'id, name, slug, price, compare_at_price, rating_avg, rating_count, has_variants, track_inventory, inventory(quantity, reserved), product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))')
    .eq('store_id', storeId).eq('status', 'active').is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(POOL);

  const rows = (data ?? []) as unknown as StorefrontProduct[];
  return {
    latest: rows.slice(0, LATEST),
    onSale: rows
      .filter((p) => p.compare_at_price != null
        && Number(p.compare_at_price) > Number(p.price))
      .slice(0, DEALS),
  };
}

export async function homeProducts(storeId: string): Promise<HomeProducts> {
  const load = unstable_cache(() => query(storeId), ['sf-home', storeId], {
    revalidate: 60,
    tags: [storeTag(storeId, 'products')],
  });
  // يفشل مفتوحًا: رئيسيةٌ بلا منتجات أهون من متجر لا يُفتح
  try { return await load(); }
  catch { return { latest: [], onSale: [] }; }
}
