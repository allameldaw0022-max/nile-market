import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * ⚠️ عميل خدمي — يتجاوز RLS.
 *
 * يُستخدم حصريًا في: مهام cron · webhooks · مهام النظام الخلفية.
 * ❌ ممنوع في أي مسار يبدأه مستخدم.
 *
 * ملاحظة أمنية: تجاوز RLS **لا يتجاوز قيود CHECK** ولا الـtriggers،
 * فقواعد فصل المهام ومنع تعديل السجلات المالية تظل سارية عليه أيضًا.
 *
 * يُفحص في CI أن هذا الملف لا يُستورد من خارج api/v1/(cron|webhooks).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط');

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
