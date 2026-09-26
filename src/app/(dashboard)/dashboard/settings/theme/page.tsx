import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { listBanners } from '@/lib/digital/dashboard';
import { ThemeSettings } from '@/components/dashboard/ThemeSettings';
import { ErrorState } from '@/components/ui/States';

export const metadata: Metadata = { title: 'قالب المتجر' };

export default async function ThemeSettingsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'settings:view');
  const supabase = await createClient();

  // ★ «خالٍ فعلًا» شرطٌ لا علَم: نفس الشرط الذي تفرضه
  //   `seed_digital_starter` في القاعدة، فلا يظهر الزرّ لمن لا ينفع معه.
  const [settingsRes, productsRes, catsRes, banners] = await Promise.all([
    supabase.from('store_settings').select('storefront_template, theme')
      .eq('store_id', membership.storeId).maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true })
      .eq('store_id', membership.storeId).is('deleted_at', null),
    supabase.from('categories').select('id', { count: 'exact', head: true })
      .eq('store_id', membership.storeId).is('deleted_at', null),
    listBanners(membership.storeId),
  ]);

  const template = settingsRes.data?.storefront_template === 'digital'
    ? 'digital' as const : 'classic' as const;
  const themeJson = (settingsRes.data?.theme ?? {}) as Record<string, unknown>;
  const raw = (themeJson.sections ?? {}) as Record<string, unknown>;
  const sections = {
    hero: raw.hero !== false,
    promo: raw.promo !== false,
    categories: raw.categories !== false,
    featured: raw.featured !== false,
    offers: raw.offers !== false,
  };
  const isEmpty = (productsRes.count ?? 0) === 0 && (catsRes.count ?? 0) === 0;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/settings"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> الإعدادات
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-ink-900">قالب المتجر</h1>
        <p className="text-sm text-ink-500">
          شكل متجرك للزبائن. التبديل لا يحذف منتجًا ولا تصنيفًا ولا طلبًا.
        </p>
      </div>

      {banners.ok ? (
        <ThemeSettings storeId={membership.storeId} template={template}
                       sections={sections} banners={banners.data}
                       isEmpty={isEmpty}
                       canEdit={can(membership, 'settings:update')} />
      ) : (
        <ErrorState description={banners.message} />
      )}
    </div>
  );
}
