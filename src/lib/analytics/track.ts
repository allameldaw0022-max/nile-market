import 'server-only';
import { after } from 'next/server';
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
 *
 * ★★ ولا تؤخّرها أيضًا: كانت الكتابة `await`-ة داخل تخطيط المتجر،
 * أي رحلةً كاملة إلى القاعدة **قبل** أن يخرج أول بايت من كل صفحة
 * متجر — وهي كتابة لا ينتظرها الزبون ولا تُغيّر ما يراه. الآن
 * تُجدوَل بـ`after` فتجري بعد إرسال الجواب.
 *
 * ★ الكوكي والمسار يُقرآن **قبل** الجدولة: واجهات الطلب تُقرأ في
 * سياق الطلب، والمُجدوَل يحمل قيمتين نصّيتين لا أكثر.
 */
export async function trackVisit(storeId: string): Promise<void> {
  try {
    const [jar, head] = await Promise.all([cookies(), headers()]);
    const visitor = jar.get(VISITOR_COOKIE)?.value;
    if (!visitor || visitor.length < 24) return;

    // ★ الجلب المسبق ليس زيارة: Next يطلب حمولة الصفحة حين يمرّ
    // الرابط أمام العين، فكانت تُسجَّل زيارة لصفحة لم تُفتح — رقمٌ
    // خاطئ في لوحة التاجر وكتابة زائدة على القاعدة في آنٍ واحد.
    if (head.get('next-router-prefetch') === '1') return;

    // المسار كما رآه الزائر، يضعه الـproxy قبل إعادة الكتابة
    const path = (head.get('x-nm-path') ?? '/').slice(0, 200);
    const supabase = await createClient();

    after(async () => {
      try {
        await supabase.rpc('track_store_visit', {
          p_store_id: storeId,
          p_visitor_token: visitor,
          p_path: path,
        });
      } catch {
        // لا شيء: زيارة غير مسجَّلة أهون من صفحة لا تُعرض
      }
    });
  } catch {
    // لا شيء
  }
}
