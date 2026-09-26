import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { decodeSlugParam } from '@/lib/tenant/params';
import { storeInfo } from '@/lib/tenant/storeInfo';

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


/**
 * صفحات سياسات المتجر (الشحن · الاسترجاع · الخصوصية · الشروط).
 * النص من `store_settings.policies` — يكتبه التاجر، ولا يوجد نص
 * افتراضي مخترَع: سياسة لم يكتبها التاجر لا تُعرض كأنها سياسته.
 */
const PAGES: Record<string, { title: string; key: string }> = {
  shipping: { title: 'سياسة الشحن والتوصيل', key: 'shipping' },
  returns:  { title: 'سياسة الاستبدال والاسترجاع', key: 'returns' },
  privacy:  { title: 'سياسة الخصوصية', key: 'privacy' },
  terms:    { title: 'الشروط والأحكام', key: 'terms' },
};

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/pages/[slug]'>,
): Promise<Metadata> {
  const { host, slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const page = PAGES[slug];
  const store = await resolveStoreByHost(host);
  if (!page || !store) return { title: 'الصفحة غير موجودة' };
  return {
    title: `${page.title} — ${store.name}`,
    alternates: { canonical: `https://${store.primaryHost}/pages/${slug}` },
  };
}

export default async function PolicyPage({ params }: PageProps<'/sites/[host]/pages/[slug]'>) {
  const { host, slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const page = PAGES[slug];
  if (!page) notFound();

  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const { policies } = await storeInfo(store.storeId);
  const body = (policies[page.key] ?? '').trim();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-extrabold text-ink-900">{page.title}</h1>
      {body ? (
        <div className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
          {body}
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-ink-300
                      bg-white px-6 py-10 text-center text-sm text-ink-500">
          لم يضِف المتجر هذه السياسة بعد. تواصل معه لأي استفسار.
        </p>
      )}
    </div>
  );
}
