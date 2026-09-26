import Image from 'next/image';
import Link from 'next/link';
import type { StoreChrome } from '@/lib/tenant/chrome';

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/** الحرف الأول من اسم التصنيف — نائبٌ محيَّد بهوية سوق النيل. */
function initial(name: string): string {
  return name.trim().charAt(0) || '؟';
}

/**
 * تصنيفات المتجر الرقمي — بطاقات بصور.
 *
 * ★★ التصنيف الفارغ لا يُعرض ولا يُحذف: `productCount === 0` يُرشَّح
 * هنا، والصفّ يبقى في القاعدة كما هو. فلا بطاقةٌ تُفتح على «لا منتجات».
 *
 * ★ والعدّاد يأتي من القشرة المخزَّنة لا من استعلام لكل بطاقة: أضيف
 * إلى استعلام التصنيفات نفسه (`products(count)`)، فكلفته صفر.
 *
 * ★ والتصنيف بلا صورة يعرض حرفه الأول على سطحٍ بالهوية — لا صورةً
 * مخترعة ولا فراغًا.
 */
export function CategoryTiles({ categories }: {
  categories: StoreChrome['categories'];
}) {
  const shown = categories.filter((c) => c.productCount > 0).slice(0, 12);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="d-cats" className="pt-8 sm:pt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="d-cats" className="text-[17px] font-bold sm:text-[19px]">
          تسوّق حسب التصنيف
        </h2>
        <Link href="/products" className="text-[13px] font-semibold"
              style={{ color: 'var(--d-accent)' }}>
          كل المنتجات
        </Link>
      </div>

      {/* شريط ممرَّر على الهاتف وشبكة على الحاسوب: خمس بطاقات في صفّ
          واحد على الهاتف تصير غير مقروءة، وتمريرها أصدق من حشرها. */}
      <ul className="d-scroll mt-4 flex gap-3 overflow-x-auto pb-1
                     sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-6">
        {shown.map((c) => {
          const img = c.image ? publicUrl(c.image.bucket, c.image.path) : null;
          return (
            <li key={c.id} className="w-[104px] shrink-0 sm:w-auto">
              <Link href={`/categories/${c.slug}`} className="group block">
                <span className="relative block aspect-square overflow-hidden rounded-lg"
                      style={{ background: 'var(--d-surface-2)',
                               border: '1px solid var(--d-border)' }}>
                  {img ? (
                    <Image src={img} alt="" fill sizes="(max-width: 640px) 104px, 180px"
                           placeholder={c.image?.blur ? 'blur' : 'empty'}
                           blurDataURL={c.image?.blur ?? undefined}
                           className="object-cover" />
                  ) : (
                    <span aria-hidden
                          className="absolute inset-0 grid place-items-center
                                     text-[28px] font-bold"
                          style={{ color: 'var(--d-accent)' }}>
                      {initial(c.name)}
                    </span>
                  )}
                </span>
                <span className="mt-2 block truncate text-center text-[12.5px]
                                 font-semibold sm:text-[13px]">
                  {c.name}
                </span>
                <span className="block text-center text-[11px]"
                      style={{ color: 'var(--d-text-3)' }}>
                  {c.productCount} منتج
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
