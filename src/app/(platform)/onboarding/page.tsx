import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './OnboardingWizard';

export const metadata: Metadata = { title: 'إنشاء متجرك' };

/** الـWizard يستأنف من آخر خطوة محفوظة (Resume · المواصفات §7). */
export default async function OnboardingPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');

  const existing = actor.stores.find((s) => s.role === 'owner');

  if (!existing) {
    return <OnboardingWizard initial={null} />;
  }

  const supabase = await createClient();
  const [{ data: store }, { data: settings }, { count: productCount }, { count: zoneCount }] =
    await Promise.all([
      supabase.from('stores')
        .select('id, name, slug, business_type, description, logo_url, status, onboarding_step')
        .eq('id', existing.storeId).single(),
      supabase.from('store_settings')
        .select('whatsapp_number, contact_phone, cod_enabled, bank_transfer_enabled, bankak_enabled')
        .eq('store_id', existing.storeId).maybeSingle(),
      supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('store_id', existing.storeId).is('deleted_at', null),
      supabase.from('delivery_zones').select('id', { count: 'exact', head: true })
        .eq('store_id', existing.storeId).is('deleted_at', null),
    ]);

  if (!store) redirect('/dashboard');
  if (store.status === 'active') redirect('/dashboard');

  return (
    <OnboardingWizard
      initial={{
        storeId: store.id,
        name: store.name,
        slug: store.slug,
        businessType: store.business_type ?? '',
        description: store.description ?? '',
        logoUrl: store.logo_url,
        step: store.onboarding_step,
        whatsapp: settings?.whatsapp_number ?? '',
        contactPhone: settings?.contact_phone ?? '',
        codEnabled: settings?.cod_enabled ?? false,
        bankTransferEnabled: settings?.bank_transfer_enabled ?? true,
        bankakEnabled: settings?.bankak_enabled ?? false,
        productCount: productCount ?? 0,
        zoneCount: zoneCount ?? 0,
      }}
    />
  );
}
