import 'server-only';
import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

/**
 * سجل الأجهزة والجلسات (مركز الأمان · المواصفات §29).
 *
 * ★ الـIP يُخزَّن **مجزَّأً** لا خامًا (SECURITY.md §16.11): التجزئة
 * تكفي لتمييز جهاز عن آخر وكشف الدخول غير المعتاد، ولا تكشف موقع
 * المستخدم لو تسرّب الجدول.
 */
function deviceLabel(ua: string): string {
  const u = ua.toLowerCase();
  const os =
    u.includes('android') ? 'أندرويد' :
    u.includes('iphone') || u.includes('ipad') ? 'آيفون/آيباد' :
    u.includes('windows') ? 'ويندوز' :
    u.includes('mac os') ? 'ماك' :
    u.includes('linux') ? 'لينكس' : 'جهاز غير معروف';
  const browser =
    u.includes('edg/') ? 'Edge' :
    u.includes('chrome/') ? 'Chrome' :
    u.includes('firefox/') ? 'Firefox' :
    u.includes('safari/') ? 'Safari' : 'متصفح';
  return `${browser} · ${os}`;
}

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** يُسجَّل بعد كل دخول ناجح بأي وسيلة. */
export async function recordLoginEvent(
  request: NextRequest | null, method: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let ua = '';
    let ip: string | null = null;
    if (request) {
      ua = request.headers.get('user-agent') ?? '';
      ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    } else {
      const h = await headers();
      ua = h.get('user-agent') ?? '';
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    }

    await supabase.from('user_sessions_meta').insert({
      user_id: user.id,
      session_id: method,
      ip_hash: await hashIp(ip),
      user_agent: ua.slice(0, 300),
      device_label: deviceLabel(ua),
    });
  } catch (err) {
    // تسجيل الجلسة مساعد ولا يُفشل الدخول
    console.error('[sessions] تعذّر تسجيل حدث الدخول', err);
  }
}
