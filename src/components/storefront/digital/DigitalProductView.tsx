import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { StoreChrome } from '@/lib/tenant/chrome';
import { DigitalBuyPanel, type DigitalField, type DigitalPackage }
  from './DigitalBuyPanel';

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/**
 * صفحة المنتج الرقمي.
 *
 * ★★ الصفحة **مخزَّنة** كما هي اليوم: كل ما هنا مُصيَّر خادميًّا من
 * الاستعلام المخزَّن نفسه — الاسم والوصف وأسماء الباقات وأسعارها
 * وأسماء حقول الشحن. فمحرّك البحث يقرأ المحتوى في HTML، ولا شيء
 * منقولٌ إلى جافاسكربت لمجرّد أنّه تفاعلي.
 *
 * ★ والتفاعل وحده على العميل (`DigitalBuyPanel`): اختيار الباقة
 * وتعبئة البيانات والمراجعة والدفع. ولا كوكي ولا جلسة تُقرأ في
 * التصيير، فالتخزين سليم.
 *
 * ★ والباقات تُعرض **قائمةً مقروءة** في الـHTML أيضًا (عبر اللوح
 * المُصيَّر خادميًّا) لا في سكربت — فالفهرسة ترى الأسعار.
 */
export function DigitalProductView({
  host, storeName, product, images, packages, fields, chrome, canCheckout,
}: {
  host: string;
  storeName: string;
  product: {
    id: string; name: string; slug: string; description: string | null;
    price: number; compare_at_price: number | null;
  };
  images: { bucket: string; path: string; blur_data_url: string | null }[];
  packages: DigitalPackage[];
  fields: DigitalField[];
  chrome: StoreChrome;
  canCheckout: boolean;
}) {
  const base = Number(product.price);
  const prices = packages
    .map((p) => (p.price != null ? Number(p.price) : base))
    .filter((n) => Number.isFinite(n));
  const from = prices.length > 0 ? Math.min(...prices) : base;
  const was = product.compare_at_price != null ? Number(product.compare_at_price) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 pb-10">
      <nav className="flex items-center gap-1 text-[12.5px]" aria-label="المسار"
           style={{ color: 'var(--d-text-2)' }}>
        <Link href="/">الرئيسية</Link>
        <ChevronRight size={13} aria-hidden />
        <Link href="/products">المنتجات</Link>
      </nav>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,320px)_1fr] md:gap-7">
        {/* الصورة */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-xl"
               style={{ background: 'var(--d-surface-2)',
                        border: '1px solid var(--d-border)' }}>
            {images[0] ? (
              <Image src={publicUrl(images[0].bucket, images[0].path)}
                     alt={product.name} fill priority
                     sizes="(max-width: 768px) 100vw, 320px"
                     placeholder={images[0].blur_data_url ? 'blur' : 'empty'}
                     blurDataURL={images[0].blur_data_url ?? undefined}
                     className="object-cover" />
            ) : (
              <span aria-hidden className="absolute inset-0 grid place-items-center
                                           text-[56px] font-bold"
                    style={{ color: 'var(--d-accent)' }}>
                {product.name.trim().charAt(0) || '؟'}
              </span>
            )}
          </div>
          {images.length > 1 && (
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {images.slice(1, 5).map((m) => (
                <li key={m.path}
                    className="relative aspect-square overflow-hidden rounded-md"
                    style={{ background: 'var(--d-surface-2)',
                             border: '1px solid var(--d-border)' }}>
                  <Image src={publicUrl(m.bucket, m.path)} alt="" fill sizes="80px"
                         className="object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* المحتوى + الشراء */}
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-snug sm:text-[24px]">
            {product.name}
          </h1>

          <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
            {packages.length > 0 && (
              <span className="text-[12.5px]" style={{ color: 'var(--d-text-3)' }}>
                يبدأ من
              </span>
            )}
            <span className="tabular text-[22px] font-bold"
                  style={{ color: 'var(--d-accent)' }}>
              {new Intl.NumberFormat('ar-SD').format(from)} ج.س
            </span>
            {was != null && was > from && (
              <span className="tabular text-[14px] line-through"
                    style={{ color: 'var(--d-text-3)' }}>
                {new Intl.NumberFormat('ar-SD').format(was)} ج.س
              </span>
            )}
          </p>

          {product.description && (
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed"
               style={{ color: 'var(--d-text-2)' }}>
              {product.description}
            </p>
          )}

          {/* ★ الباقات مُصيَّرة خادميًّا في قائمة مقروءة: الفهرسة تراها،
              ومن لا جافاسكربت عنده يرى ما يُبيعه المتجر وبأيّ سعر. */}
          {packages.length > 0 && (
            <section aria-labelledby="d-packs" className="mt-5">
              <h2 id="d-packs" className="text-[13px] font-bold">
                الباقات المتاحة
              </h2>
              <ul className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                {packages.map((p) => (
                  <li key={p.id} className="rounded px-2 py-1"
                      style={{ background: 'var(--d-surface-2)',
                               color: 'var(--d-text-2)' }}>
                    {p.name} — {new Intl.NumberFormat('ar-SD').format(
                      p.price != null ? Number(p.price) : base)} ج.س
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-5">
            <DigitalBuyPanel
              host={host}
              productId={product.id}
              productName={product.name}
              basePrice={base}
              packages={packages}
              fields={fields}
              canCheckout={canCheckout}
              methods={{ bankTransfer: chrome.bankTransferEnabled,
                         bankak: chrome.bankakEnabled }}
            />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed"
             style={{ color: 'var(--d-text-3)' }}>
            يُنفَّذ الطلب من {storeName} بعد تأكيد الدفع. تُستعمل بيانات
            الشحن لتنفيذ طلبك وحده.
          </p>
        </div>
      </div>
    </div>
  );
}
