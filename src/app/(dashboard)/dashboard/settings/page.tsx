import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FileText, Globe, Truck, Users } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/supabase/rpc';
import { Card } from '@/components/ui/Card';
import { StoreProfileForm, type StoreProfile } from '@/components/dashboard/StoreProfileForm';
import { StoreCoverForm } from '@/components/dashboard/StoreCoverForm';
import { BankAccountsForm } from '@/components/dashboard/BankAccountsForm';
import type { BankAccount } from '@/lib/settings/actions';

export const metadata: Metadata = { title: 'الإعدادات' };

const LINKS = [
  { href: '/dashboard/settings/delivery', label: 'مناطق التوصيل',
    hint: 'المدن وأجور التوصيل', icon: Truck },
  { href: '/dashboard/settings/policies', label: 'سياسات المتجر',
    hint: 'الشحن والاسترجاع والخصوصية', icon: FileText },
  { href: '/dashboard/settings/domain', label: 'الدومين',
    hint: 'رابط المتجر والدومين المخصص', icon: Globe },
  { href: '/dashboard/settings/team', label: 'فريق العمل',
    hint: 'الموظفون وصلاحياتهم', icon: Users },
];

export default async function SettingsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'settings:view');
  const canEdit = can(membership, 'settings:update');
  const canBanking = can(membership, 'settings:banking');

  const supabase = await createClient();
  const [{ data: store }, { data: settings }, { data: payment }, { data: ops }] =
    await Promise.all([
    supabase.from('stores')
      .select('name, business_type, description, slug, banner_url')
      .eq('id', membership.storeId).maybeSingle(),
    supabase.from('store_settings')
      .select('whatsapp_number, contact_phone, contact_email, address, cod_enabled, bank_transfer_enabled, bankak_enabled')
      .eq('store_id', membership.storeId).maybeSingle(),
    // يعود فارغًا لمن لا يملك settings:banking — وهذا هو المقصود
    canBanking
      ? supabase.from('store_payment_settings').select('bank_accounts, bankak_number')
          .eq('store_id', membership.storeId).maybeSingle()
      : Promise.resolve({ data: null }),
    // ★ الإعدادات التشغيلية الداخلية محجوبة عن المسار العام على مستوى
    // العمود (0038)، وتُقرأ من دالة تفحص `settings:view`.
    rpc(supabase, 'store_operational_settings', { p_store_id: membership.storeId }),
  ]);

  const operational = ops?.[0] ?? null;

  const address = (settings?.address ?? {}) as { city?: string; line?: string };

  const profile: StoreProfile = {
    name: store?.name ?? '',
    businessType: store?.business_type ?? '',
    description: store?.description ?? '',
    whatsapp: settings?.whatsapp_number ?? '',
    contactPhone: settings?.contact_phone ?? '',
    contactEmail: settings?.contact_email ?? '',
    city: address.city ?? '',
    addressLine: address.line ?? '',
    orderPrefix: operational?.order_prefix ?? '',
    lowStockThreshold: operational?.low_stock_threshold ?? 5,
    codEnabled: settings?.cod_enabled ?? false,
    bankTransferEnabled: settings?.bank_transfer_enabled ?? true,
    bankakEnabled: settings?.bankak_enabled ?? false,
  };

  const accounts = (payment?.bank_accounts ?? []) as BankAccount[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الإعدادات</h1>
        {store?.slug && (
          <p className="text-sm text-ink-500" dir="ltr">
            {store.slug}.nilemarket.online
          </p>
        )}
      </div>

      <nav className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="flex items-center gap-3 p-4 hover:border-teal-400">
              <span className="grid size-10 shrink-0 place-items-center rounded-md
                               bg-teal-50 text-teal-700">
                <link.icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-ink-900">{link.label}</span>
                <span className="block text-xs text-ink-500">{link.hint}</span>
              </span>
            </Card>
          </Link>
        ))}
      </nav>

      <StoreProfileForm storeId={membership.storeId} initial={profile} canEdit={canEdit} />

      <StoreCoverForm storeId={membership.storeId}
                      initialUrl={store?.banner_url ?? null} canEdit={canEdit} />

      {canBanking && (
        <BankAccountsForm storeId={membership.storeId} initialAccounts={accounts}
                          initialBankak={payment?.bankak_number ?? ''} canEdit />
      )}
    </div>
  );
}
