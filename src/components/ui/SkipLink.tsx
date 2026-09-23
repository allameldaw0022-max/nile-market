/**
 * رابط «تخطّي إلى المحتوى».
 *
 * ★ WCAG 2.4.1 (Bypass Blocks, مستوى A): كل تخطيط هنا يبدأ بترويسة
 * وشريط تنقّل فيهما روابط كثيرة. مستخدم لوحة المفاتيح أو قارئ الشاشة
 * كان مضطرًا للمرور عليها كلها في **كل** صفحة قبل بلوغ المحتوى.
 *
 * مخفي بصريًا حتى يأخذ التركيز، فيظهر عندها كأول عنصر في الصفحة.
 * الاتجاه rtl فالموضع يُثبَّت بـ inset-inline-start لا بـ left.
 */
export function SkipLink({ href = '#main' }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:z-50
                 focus:m-3 focus:rounded-md focus:bg-teal-600
                 focus:px-4 focus:py-2 focus:text-white focus:shadow-raised"
    >
      تخطّي إلى المحتوى
    </a>
  );
}
