import 'server-only';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { VISITOR_COOKIE } from '@/lib/referral';

/**
 * تسجيل زيارة متجر.
 *
 * ★ الحدّ في القاعدة لا هنا: `track_store_visit` تتجاهل الزيارة
 * المكرّرة لنفس الزائر خلال دقيقة (`check_rate_limit`)، فنداؤها في كل
 * تنقّل رخيص ولا يضخّم الرقم.
 *
 * ★ لا يُخزَّن عنوان IP ولا أي معرّف شخصي: التوكن عشوائي من الكوكي،
 * والمسار وحده هو ما يُحفظ معه.
 *
 * ★ الفشل صامت تمامًا: الإحصاءات لا تمنع عرض صفحة لزبون.
 */
export async function trackVisit(storeId: string): Promise<void> {
  try {
    const [jar, head] = await Promise.all([cookies(), headers()]);
    const visitor = jar.get(VISITOR_COOKIE)?.value;
    if (!visitor || visitor.length < 24) return;

    // المسار كما رآه الزائر، يضعه الـproxy قبل إعادة الكتابة
    const path = head.get('x-nm-path') ?? '/';

    const supabase = await createClient();
    await supabase.rpc('track_store_visit', {
      p_store_id: storeId,
      p_visitor_token: visitor,
      p_path: path.slice(0, 200),
    });
  } catch {
    // لا شيء: زيارة غير مسجَّلة أهون من صفحة لا تُعرض
  }
}
