import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/**
 * عميل الخادم بمفتاح anon — يخضع لـRLS بالكامل.
 * هذا هو العميل الافتراضي لكل قراءة وكتابة يبدأها مستخدم.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // استُدعي من Server Component — الـproxy يجدّد الجلسة بدلًا منه
          }
        },
      },
    },
  );
}
