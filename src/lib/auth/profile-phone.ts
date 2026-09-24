'use server';
import 'server-only';
import { requireUser } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { normalizePhone } from '@/lib/phone';

/**
 * رقم التواصل لحساب قائم.
 *
 * ★ لماذا خطوة مستقلة؟ التسجيل بالبريد يسأل عن الرقم في النموذج،
 * أمّا Google فلا يمرّر رقمًا إطلاقًا. فمن دخل به كان يصل بلا رقم،
 * ولا سبيل لمراسلته إن توقّف قبل إكمال متجره.
 *
 * ★ يُوحَّد قبل الحفظ: الرقم الواحد يُكتب بأربع صور، وتخزينه كما
 * كُتب يُفشل رابط واتساب على صورة ويُنجحه على أخرى.
 *
 * ★ الكتابة على صفّ صاحب الجلسة وحده: `profiles_update_self` تشترط
 * `id = auth.uid()`، و`app.protect_profile_columns` يردّ أي محاولة
 * لمسّ الأعمدة الحسّاسة في نفس التحديث.
 */
export async function savePhone(input: {
  phone: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    const phone = normalizePhone(input.phone);
    if (!phone || phone.replace(/\D/g, '').length < 9) {
      throw errors.validation('أدخل رقم واتساب صحيح', 'phone');
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('profiles').update({ phone }).eq('id', actor.userId);
    if (error) throw fromPostgres(error);

    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
