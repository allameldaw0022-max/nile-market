import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createPublicClient } from '@/lib/supabase/public';
import { rpc } from '@/lib/supabase/rpc';
import { REFERRAL_COOKIE, REFERRAL_MAX_AGE } from '@/lib/referral';

/**
 * الرابط القصير `/r/<رقم الشريك>`.
 *
 * ★ مدخل ثانٍ لنفس نظام الإحالة، لا نظام إسناد ثانٍ: الرقم يُترجَم
 * في القاعدة إلى رمز الإحالة، ثم تُسجَّل الزيارة بـ
 * `record_referral_visit` نفسها — فيسري عليها Last-touch ونافذة
 * الثلاثين يومًا ومنع الإسناد الذاتي بلا حرف إضافي.
 *
 * ★ الكوكي HttpOnly ويُكتب خادميًا: قيمته تحدّد من يقبض العمولة.
 *
 * ★ رقم غير معروف أو شريك موقوف ⇒ تحويل صامت إلى الصفحة الرئيسية.
 * لا رسالة خطأ: الرابط يُشارَك علنًا، ولا نُخبر من يخمّن الأرقام
 * أيّها صالح.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> },
) {
  const { serial } = await params;
  const home = new URL('/', request.nextUrl.origin);
  const response = NextResponse.redirect(home);

  if (!/^\d{1,9}$/.test(serial)) return response;

  try {
    const supabase = createPublicClient();
    const { data: code } = await rpc(supabase, 'partner_code_by_serial', {
      p_serial: Number(serial),
    });
    if (typeof code !== 'string' || !code) return response;

    let token = request.cookies.get(REFERRAL_COOKIE)?.value;
    if (!token || token.length < 24) {
      token = randomBytes(32).toString('hex');
      response.cookies.set(REFERRAL_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REFERRAL_MAX_AGE,
      });
    }

    // نفس الدالة التي يناديها الـproxy للرابط الطويل — لا مسار ثانٍ
    await supabase.rpc('record_referral_visit', {
      p_code: code,
      p_visitor_token: token,
      p_landing_path: `/r/${serial}`,
      p_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      p_user_agent: request.headers.get('user-agent') ?? undefined,
    });
  } catch (error) {
    // فشل التسجيل لا يمنع الزائر من الوصول — العمولة ليست شأنه
    console.error('[referral] تعذّر تسجيل زيارة الرابط القصير', error);
  }

  return response;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
