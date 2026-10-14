import { cookies } from 'next/headers';
import { getActor } from '@/lib/auth/actor';

/**
 * هوية الزائر الحالي — للشريط العلويّ في القسم التعريفيّ وحده.
 *
 * ★★★ سببه أداءٌ مقيس لا ذوق: `layout` القسم العام كان ينادي
 * `getActor()`، وهي تقرأ الكوكيز. ووجود قراءة كوكيز في التخطيط يجعل
 * Next يصيّر **كل** صفحات القسم لكل طلب — سبع عشرة صفحة تعريفية،
 * منها الرئيسية والباقات والأسئلة والصفحات القانونية. وصفحة
 * الرئيسية تعلن `revalidate = 300` فيبدو أنها مخزَّنة، والتخزين
 * مُبطَل من فوقها بلا أن يقول أحد.
 *
 * القياس على الإنتاج قبل هذا المسار: `cache-control: no-store` و
 * `x-vercel-cache: MISS` في كل طلب، وTTFB ~٥٧٥ م.ث للرئيسية — وهي
 * أول ما يراه الزائر الجديد.
 *
 * فالفصل هو الحلّ، كما في `/sites/[host]/viewer` حرفيًّا: القشرة
 * والمحتوى عامّان ⇒ يُخزَّنان على الحافّة؛ وهذا المسار يحمل الشخصيّ
 * ⇒ لا يُخزَّن أبدًا.
 *
 * ★ والزائر بلا كوكي جلسة — وهو الأغلبية الساحقة — يُجاب بلا أي نداء
 *   قاعدة: فحصٌ نصّيّ محلّي للكوكي وحده.
 *
 * ★ ولا يُعاد منه ما يخصّ غير صاحب الجلسة: الحقول الخمسة أدناه كلّها
 *   مشتقّة من `getActor()` بجلسة الطلب نفسها، وهي فاشلةٌ مغلقة.
 */
export const dynamic = 'force-dynamic';

export type MePayload = {
  signedIn: boolean;
  /** يملك متجرًا ⇒ وجهة الزرّ لوحة التحكم لا معالج الإنشاء */
  hasStore: boolean;
  email: string | null;
  isPlatformStaff: boolean;
  isPartner: boolean;
};

const EMPTY: MePayload = {
  signedIn: false, hasStore: false,
  email: null, isPlatformStaff: false, isPartner: false,
};

const noStore = (body: MePayload) =>
  Response.json(body, {
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });

export async function GET() {
  try {
    const jar = await cookies();
    const hasSessionCookie = jar.getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
    if (!hasSessionCookie) return noStore(EMPTY);

    const actor = await getActor();
    if (actor.kind !== 'user') return noStore(EMPTY);

    return noStore({
      signedIn: true,
      hasStore: actor.stores.length > 0,
      email: actor.email,
      isPlatformStaff: Boolean(actor.admin),
      isPartner: Boolean(actor.partnerId),
    });
  } catch {
    // يفشل مغلقًا على «زائر»: شريطٌ بأزرار الدخول أهون من صفحة لا تُرسم.
    return noStore(EMPTY);
  }
}
