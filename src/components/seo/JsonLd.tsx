import type { StorefrontJsonLd } from '@/lib/seo/schema';

/**
 * بيانات منظَّمة (schema.org) في وسم script.
 *
 * ★ `JSON.stringify` مع تهريب `<` وحده: محرّكات البحث تقرأ JSON
 * سليمًا، ووسم `</script>` داخل اسم منتج كان سيغلق الوسم ويحقن HTML.
 */
export function JsonLd({ data }: { data: StorefrontJsonLd }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: json }} />
  );
}
