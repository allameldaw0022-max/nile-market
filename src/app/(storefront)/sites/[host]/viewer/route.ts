import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { resolveStoreByHost, storeTag } from '@/lib/tenant/resolve';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import { loadCart } from '@/lib/cart/actions';
import { readCartToken } from '@/lib/cart/token';
import { rpc } from '@/lib/supabase/rpc';

/**
 * ★★ بيانات الزائر وحده — كل ما كان يجعل صفحة المتجر غير قابلة
 * للتخزين، في مسار واحد لا يُخزَّن.
 *
 * قياس اختبار الضغط السابق: سقف طبقة التطبيق كان ~٩٥ طلبًا/ثانية
 * لأن **كل** صفحة متجر تُصيَّر من جديد لكل زائر. والسبب لم يكن ثقل
 * المحتوى — المحتوى نفسه لكل الزوّار — بل ثلاثة أشياء شخصية مبثوثة
 * في شجرة التصيير: عدّاد السلة، وحالة الدخول، والمفضّلة. وجود
 * `cookies()` في أيّ منها يجعل Next يصيّر المسار كلّه لكل طلب.
 *
 * فالحلّ فصلٌ لا تخفيف: القشرة والمحتوى عامّان ⇒ يُخزَّنان؛ وهذا
 * المسار يحمل الشخصي ⇒ لا يُخزَّن أبدًا.
 *
 * ★ الحدود الأمنية لم تتغيّر:
 *   · `storeId` من الـHost في المسار حصريًا — نفس جدار IDOR.
 *   · كل استعلام يمرّ بـRLS بجلسة الزائر نفسها (لا service role).
 *   · لا يُعاد شيء عن زائر آخر: المفضّلة والسلة والتقييم كلّها
 *     محصورة بالهوية في القاعدة لا في هذا الملف.
 *
 * ★ والزائر البارد (بلا كوكي سلة ولا كوكي جلسة) يُجاب **بصفر
 *   نداءات قاعدة**: وهو الأغلبية الساحقة من زوّار المتاجر.
 */
export const dynamic = 'force-dynamic';

type ViewerPayload = {
  signedIn: boolean;
  cartCount: number;
  /** معرّفات منتجات هذا المتجر في مفضّلة الزائر */
  saved: string[];
  /** يُطلب الدمج مرّة واحدة: حساب مسجَّل + توكن سلة زائر */
  needsMerge: boolean;
  /** صاحب المتجر — لسطر «لم يُنشر بعد» وحده */
  owner: boolean;
  /** حالة التقييم لمنتج بعينه، إن سُئل عنه */
  review: {
    canReview: boolean; reason: string;
    myRating: number | null; myBody: string | null; myHidden: boolean;
  } | null;
};

const EMPTY: ViewerPayload = {
  signedIn: false, cartCount: 0, saved: [],
  needsMerge: false, owner: false, review: null,
};

/** لا يُخزَّن في متصفّح ولا في CDN ولا في وسيط: بيانات زائر بعينه. */
const noStore = (body: ViewerPayload) =>
  NextResponse.json(body, {
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });

export async function GET(
  request: Request,
  { params }: RouteContext<'/sites/[host]/viewer'>,
) {
  try {
    const { host } = await params;
    const store = await resolveStoreByHost(host);
    if (!store) return noStore(EMPTY);

    const url = new URL(request.url);
    // ★ السَلَك من المسار الذي يراه الزائر، ويُترجَم هنا خادميًا إلى
    //   معرّف بقراءةٍ مخزَّنة ومحصورة بهذا المتجر — فلا يمرّر العميل
    //   معرّف منتج متجر آخر.
    const slug = url.searchParams.get('slug');
    const productId = slug
      ? await productIdOf(store.storeId, slug)
      : null;

    const [jar, cartToken] = await Promise.all([cookies(), readCartToken(host)]);
    // ★ وجود كوكي جلسة فحصٌ نصّي محلّي: لا نداء شبكة لزائر لا جلسة له،
    //   وهو أكثر حالة تنفيذًا في المنصّة كلّها.
    const hasSessionCookie = jar.getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));

    // زائر بارد تمامًا ولا سؤال عن منتج ⇒ جواب فوري بلا قاعدة
    if (!hasSessionCookie && !cartToken && !productId) return noStore(EMPTY);


    const supabase = await createClient();
    const signedIn = hasSessionCookie
      ? Boolean((await supabase.auth.getUser()).data.user)
      : false;

    const [lines, savedIds, review, owner] = await Promise.all([
      cartToken || signedIn ? loadCart(host) : Promise.resolve([]),
      signedIn ? wishlistIds(supabase, store.storeId) : Promise.resolve([]),
      productId ? reviewState(supabase, productId) : Promise.resolve(null),
      signedIn && store.status !== 'active'
        ? isOwner(supabase, store.storeId)
        : Promise.resolve(false),
    ]);

    return noStore({
      signedIn,
      cartCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      saved: savedIds,
      needsMerge: signedIn && Boolean(cartToken),
      owner,
      review,
    });
  } catch {
    // يفشل مفتوحًا على «زائر بلا شيء»: قلبٌ فارغ وسلّة صفر أهون من
    // صفحة متجر لا تعمل. والمحتوى العامّ معروض أصلًا قبل هذا النداء.
    return noStore(EMPTY);
  }
}

/**
 * سَلَك ⟶ معرّف، محصورًا بهذا المتجر ومخزَّنًا.
 *
 * ★ الحصر بـ`store_id` هو نفس جدار IDOR: سَلَك منتجٍ في متجر آخر
 * لا يُترجَم هنا، فلا تُقرأ حالة تقييمٍ لمنتج ليس من هذا المضيف.
 */
async function productIdOf(storeId: string, slug: string): Promise<string | null> {
  const load = unstable_cache(
    async () => {
      const supabase = createPublicClient();
      const { data } = await supabase.from('products').select('id')
        .eq('store_id', storeId).eq('slug', slug)
        .eq('status', 'active').is('deleted_at', null).maybeSingle();
      return data?.id ?? null;
    },
    ['viewer-product-id', storeId, slug],
    { revalidate: 300, tags: [storeTag(storeId, 'products')] },
  );
  try { return await load(); } catch { return null; }
}

async function wishlistIds(
  supabase: Awaited<ReturnType<typeof createClient>>, storeId: string,
): Promise<string[]> {
  // ★ `my_wishlist` القائمة لا دالّة جديدة: مفضّلة هذا المتجر للمستخدم
  //   الحالي، محصورة بـRLS، ونأخذ المعرّفات وحدها.
  const { data, error } = await rpc(supabase, 'my_wishlist', { p_store_id: storeId });
  if (error || !data) return [];
  return data.map((r) => r.product_id);
}

async function reviewState(
  supabase: Awaited<ReturnType<typeof createClient>>, productId: string,
) {
  // ★ تُنادى للجميع بنفس الشكل: للزائر تعيد «auth» بلا أي معلومة عن
  //   طلبات أحد، فلا يُفرَّق بين مشترٍ وغيره من شكل الطلب.
  const { data, error } = await rpc(supabase, 'product_review_state',
                                    { p_product_id: productId });
  const state = error ? null : data?.[0] ?? null;
  return {
    canReview: state?.can_review ?? false,
    reason: state?.reason ?? 'auth',
    myRating: state?.my_rating ?? null,
    myBody: state?.my_body ?? null,
    myHidden: state?.my_status === 'hidden',
  };
}

async function isOwner(
  supabase: Awaited<ReturnType<typeof createClient>>, storeId: string,
): Promise<boolean> {
  // العضوية تمرّ بـRLS: صفٌّ واحد أو لا شيء، ولا كشف عن فريق متجر آخر.
  const { data } = await supabase.from('store_members')
    .select('store_id').eq('store_id', storeId)
    .eq('status', 'active').is('deleted_at', null).maybeSingle();
  return Boolean(data);
}
