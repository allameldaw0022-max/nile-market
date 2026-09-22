import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { formatDate } from '@/lib/money/format';

export const revalidate = 300;

const SLUGS = ['terms', 'privacy', 'subscription', 'cancellation'] as const;

async function load(slug: string) {
  if (!(SLUGS as readonly string[]).includes(slug)) return null;
  const supabase = await createClient();
  const { data } = await rpc(supabase, 'legal_document', { p_slug: slug });
  return firstRow(data);
}

export async function generateMetadata(
  { params }: PageProps<'/legal/[slug]'>,
): Promise<Metadata> {
  const { slug } = await params;
  const doc = await load(slug);
  if (!doc) return { title: 'الصفحة غير موجودة' };
  return { title: doc.title, description: `${doc.title} — نايل ماركت` };
}

/**
 * الوثائق القانونية للمنصة.
 *
 * ★ لا نصّ افتراضي مخترَع: وثيقة لم يكتبها مالك المنصة تُعرض
 * «لم تُنشر بعد» لا بنصّ عامّ يبدو كأنه التزام قانوني. نفس القاعدة
 * المطبَّقة على سياسات المتجر.
 *
 * ★ النص يُعرض خامًا (`whitespace-pre-line`) بلا تفسير HTML.
 */
export default async function LegalPage({ params }: PageProps<'/legal/[slug]'>) {
  const { slug } = await params;
  const doc = await load(slug);
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-navy-900">{doc.title}</h1>

      {doc.body ? (
        <>
          <p className="mt-1 text-xs text-sand-600">
            آخر تحديث: {formatDate(doc.updated_at)}
          </p>
          <div className="mt-6 whitespace-pre-line leading-relaxed text-navy-800">
            {doc.body}
          </div>
        </>
      ) : (
        <Card className="mt-6 p-8 text-center">
          <FileText size={36} strokeWidth={1.5} className="mx-auto text-sand-400" />
          <p className="mt-3 font-bold text-navy-900">لم تُنشر هذه الوثيقة بعد</p>
          <p className="mt-1 text-sm text-sand-600">
            لا نعرض نصًّا افتراضيًا مكان وثيقة لم تُكتب. للاستفسار عن
            الشروط الحالية تواصل مع الدعم.
          </p>
        </Card>
      )}
    </div>
  );
}
