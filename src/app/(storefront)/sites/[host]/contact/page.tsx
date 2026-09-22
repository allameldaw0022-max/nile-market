import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';

export const revalidate = 300;

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/contact'>,
): Promise<Metadata> {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) return { title: 'المتجر غير موجود' };
  return {
    title: `تواصل معنا — ${store.name}`,
    alternates: { canonical: `https://${store.primaryHost}/contact` },
  };
}

export default async function ContactPage({ params }: PageProps<'/sites/[host]/contact'>) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('store_settings')
    .select('whatsapp_number, contact_phone, contact_email, address, social_links')
    .eq('store_id', store.storeId).maybeSingle();

  const whatsapp = settings?.whatsapp_number ?? null;
  const address = (settings?.address ?? {}) as { city?: string; line?: string };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-extrabold text-navy-900">تواصل مع {store.name}</h1>
      <p className="mt-1 text-sm text-sand-600">
        نرد على استفساراتك في أسرع وقت.
      </p>

      <Card className="mt-6 divide-y divide-sand-200">
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
             target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-3 p-4 hover:bg-sand-50">
            <MessageCircle size={20} className="text-[#25D366]" />
            <span className="flex-1 font-bold text-navy-900">واتساب</span>
            <span className="tabular text-sand-600" dir="ltr">{whatsapp}</span>
          </a>
        )}
        {settings?.contact_phone && (
          <a href={`tel:${settings.contact_phone}`}
             className="flex items-center gap-3 p-4 hover:bg-sand-50">
            <Phone size={20} className="text-nile-500" />
            <span className="flex-1 font-bold text-navy-900">هاتف</span>
            <span className="tabular text-sand-600" dir="ltr">{settings.contact_phone}</span>
          </a>
        )}
        {settings?.contact_email && (
          <a href={`mailto:${settings.contact_email}`}
             className="flex items-center gap-3 p-4 hover:bg-sand-50">
            <Mail size={20} className="text-nile-500" />
            <span className="flex-1 font-bold text-navy-900">البريد</span>
            <span className="text-sand-600" dir="ltr">{settings.contact_email}</span>
          </a>
        )}
        {!whatsapp && !settings?.contact_phone && !settings?.contact_email && (
          <p className="p-6 text-center text-sm text-sand-600">
            لم يضِف المتجر بيانات تواصل بعد.
          </p>
        )}
      </Card>

      {(address.city || address.line) && (
        <Card className="mt-4 p-4">
          <h2 className="font-bold text-navy-900">العنوان</h2>
          <p className="mt-1 text-sm text-sand-600">
            {[address.city, address.line].filter(Boolean).join(' — ')}
          </p>
        </Card>
      )}
    </div>
  );
}
