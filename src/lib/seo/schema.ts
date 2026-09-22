/**
 * بناء البيانات المنظَّمة.
 *
 * ★ لا نعلن ما لا نعرفه: التقييمات والمخزون والشحن لا تُكتب إلا من
 * بيانات حقيقية. Schema مزيّفة تُسقط الموقع من النتائج الغنيّة كلها،
 * لا هذا الحقل وحده.
 */
export type StorefrontJsonLd = Record<string, unknown>;

const CURRENCY = 'SDG';

export function storeSchema(input: {
  name: string; host: string; description?: string | null;
  logo?: string | null; phone?: string | null;
}): StorefrontJsonLd {
  const url = `https://${input.host}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: input.name,
    url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.logo ? { logo: input.logo, image: input.logo } : {}),
    ...(input.phone ? { telephone: input.phone } : {}),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${url}/search?q={q}` },
      'query-input': 'required name=q',
    },
  };
}

export function productSchema(input: {
  name: string; description?: string | null; sku?: string | null;
  price: number; image?: string | null; url: string;
  storeName: string;
  /** null ⇒ لا نعرف التوفّر (المتجر لا يتابع المخزون) فلا نعلنه. */
  inStock: boolean | null;
  canBuy: boolean;
}): StorefrontJsonLd {
  const availability = input.canBuy === false
    ? 'https://schema.org/PreOrder'
    : input.inStock === null
      ? 'https://schema.org/InStock'
      : input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.image ? { image: [input.image] } : {}),
    brand: { '@type': 'Brand', name: input.storeName },
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: CURRENCY,
      price: input.price.toFixed(2),
      availability,
      seller: { '@type': 'Organization', name: input.storeName },
    },
  };
}

export function breadcrumbSchema(
  host: string, trail: { name: string; path: string }[],
): StorefrontJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `https://${host}${item.path}`,
    })),
  };
}
