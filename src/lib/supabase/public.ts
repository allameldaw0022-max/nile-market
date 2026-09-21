import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * عميل عام بلا جلسة وبلا كوكيز — مفتاح anon فقط، وRLS سارية بالكامل.
 *
 * يُستخدم للقراءات العامة التي لا تعتمد على هوية المستخدم، وأهمها
 * حل المستأجر من الـHost. سبب وجوده تقني أيضًا: الدوال المخزَّنة
 * بـunstable_cache لا يجوز أن تلمس cookies() لأن ذلك يجعل النتيجة
 * مرتبطة بمستخدم بعينه — وحل المستأجر عام بطبيعته.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
