import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * أسئلة شائعة — `details/summary` أصليّان.
 *
 * ★ بلا JavaScript وبلا حالة: الفتح والإغلاق وإتاحة لوحة المفاتيح
 * وقراءة الشاشة كلها من المتصفّح مجانًا. أكورديون مبني بـuseState
 * يزن أكثر ويتطلّب إعادة بناء `aria-expanded` يدويًا — ثم يخطئ فيه.
 *
 * ★ الأسئلة عن المنتج فعلًا لا نصّ تسويقي عامّ: كل إجابة تصف سلوكًا
 * حقيقيًا في النظام، ومنها ما يذكر حدودًا صريحة بدل تجميلها.
 */
const ITEMS: { q: string; a: string }[] = [
  {
    q: 'كم يستغرق إنشاء المتجر؟',
    a: 'دقائق. تختار اسم المتجر ونوع النشاط فيُنشأ فورًا برابط فرعي جاهز، ثم تضيف منتجاتك متى شئت.',
  },
  {
    q: 'هل أحتاج بطاقة بنكية للبدء؟',
    a: 'لا. الباقة المجانية تُفعَّل بالتسجيل وحده، وتكفي لعرض منتجاتك واستقبال الطلبات.',
  },
  {
    q: 'كيف يدفع عملائي؟',
    a: 'الدفع عند الاستلام، أو التحويل البنكي، أو بنكك. تفعّل ما يناسبك من إعدادات المتجر، وما تطفئه لا يظهر للعميل عند إتمام الطلب.',
  },
  {
    q: 'هل أستطيع ربط دومين أملكه؟',
    a: 'نعم. رابطك الفرعي على سوق النيل يبقى يعمل دائمًا، ويمكنك ربط دومينك الخاص إلى جانبه مع إرشادات DNS داخل اللوحة.',
  },
  {
    q: 'من يرى بيانات متجري؟',
    a: 'أنت ومن تضيفهم لفريقك بالصلاحيات التي تحدّدها. العزل بين المتاجر مفروض في قاعدة البيانات نفسها لا في الواجهة فقط.',
  },
  {
    q: 'ماذا يحدث لو انتهى اشتراكي؟',
    a: 'متجرك وبياناتك تبقى كما هي، ويتوقّف استقبال الطلبات الجديدة حتى تجدّد. لا يُحذف شيء بانتهاء الاشتراك.',
  },
  {
    q: 'هل أستطيع نقل منتجاتي من مكان آخر؟',
    a: 'نعم، عبر استيراد ملف CSV مع معاينة قبل التنفيذ تُظهر ما سيُضاف وما فيه خطأ قبل أن يُكتب أي شيء.',
  },
  {
    q: 'هل يمكن لأكثر من شخص إدارة المتجر؟',
    a: 'نعم. تدعو موظّفين بأدوار محدّدة — طلبات أو منتجات أو خدمة عملاء — وكل دور يرى ما يخصّه فقط.',
  },
];

export function Faq({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-x-10 md:grid-cols-2', className)}>
      {ITEMS.map((item) => (
        <details key={item.q} className="group border-b border-ink-200 py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5
                              text-[15px] font-medium text-ink-900 marker:hidden
                              hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600">
            {item.q}
            <ChevronDown size={17} aria-hidden
              className="shrink-0 text-ink-400 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="pb-4 text-[14px] leading-relaxed text-ink-500">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
