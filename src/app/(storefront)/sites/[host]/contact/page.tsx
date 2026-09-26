import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { storeInfo } from '@/lib/tenant/storeInfo';
import { Card } from '@/components/ui/Card';
import { waNumber } from '@/lib/phone';

export const revalidate = 300;

/**
 * ★★ هذا ما يفتح التخزين التدريجي (ISR) لمسارٍ ذي معامل ديناميكي.
 *
 * دليل Next صريح: «`generateStaticParams` هي ما يُمكّن ISR للمسار
 * الديناميكي». وبدونها يبقى المسار «يُصيَّر عند الطلب» بترويسة
 * `Cache-Control: private, no-store` — أي تصييرٌ كامل لكل زائر،
 * وهو الاختناق الذي قاسه اختبار الضغط.
 *
 * ★ وتعيد قائمة فارغة عن قصد: المضيفات ليست معروفة وقت البناء (ولا
 * يجوز أن يسأل البناء القاعدة عن متاجر العملاء)، فلا يُبنى شيء
 * مسبقًا — ويُبنى كل مضيف عند أول طلب له ثم يُخدَم من التخزين.
 *
 * ★ ومفتاح التخزين هو المسار، والمسار يحمل المضيف
 * (`/sites/<host>/...` بعد إعادة كتابة الـproxy) ⇒ لكل متجر مدخله
 * الخاص. وهذا هو جدار العزل نفسه الذي يحمي بقية النظام: عزلٌ
 * بالمضيف لا بمعامل يرسله العميل.
 */
export async function generateStaticParams() {
  return [];
}


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

  const settings = await storeInfo(store.storeId);
  const whatsapp = settings.whatsapp;
  const address = settings.address;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-extrabold text-ink-900">تواصل مع {store.name}</h1>
      <p className="mt-1 text-sm text-ink-500">
        نرد على استفساراتك في أسرع وقت.
      </p>

      <Card className="mt-6 divide-y divide-ink-200">
        {whatsapp && (
          <a href={`https://wa.me/${waNumber(whatsapp)}`}
             target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-3 p-4 hover:bg-ink-50">
            <MessageCircle size={20} className="text-[#25D366]" />
            <span className="flex-1 font-bold text-ink-900">واتساب</span>
            <span className="tabular text-ink-500" dir="ltr">{whatsapp}</span>
          </a>
        )}
        {settings.contactPhone && (
          <a href={`tel:${settings.contactPhone}`}
             className="flex items-center gap-3 p-4 hover:bg-ink-50">
            <Phone size={20} className="text-teal-700" />
            <span className="flex-1 font-bold text-ink-900">هاتف</span>
            <span className="tabular text-ink-500" dir="ltr">{settings.contactPhone}</span>
          </a>
        )}
        {settings.contactEmail && (
          <a href={`mailto:${settings.contactEmail}`}
             className="flex items-center gap-3 p-4 hover:bg-ink-50">
            <Mail size={20} className="text-teal-700" />
            <span className="flex-1 font-bold text-ink-900">البريد</span>
            <span className="text-ink-500" dir="ltr">{settings.contactEmail}</span>
          </a>
        )}
        {!whatsapp && !settings.contactPhone && !settings.contactEmail && (
          <p className="p-6 text-center text-sm text-ink-500">
            لم يضِف المتجر بيانات تواصل بعد.
          </p>
        )}
      </Card>

      {(address.city || address.line) && (
        <Card className="mt-4 p-4">
          <h2 className="font-bold text-ink-900">العنوان</h2>
          <p className="mt-1 text-sm text-ink-500">
            {[address.city, address.line].filter(Boolean).join(' — ')}
          </p>
        </Card>
      )}
    </div>
  );
}
