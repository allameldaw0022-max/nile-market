'use client';
import { useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';

/**
 * مشاركة المنتج — واتساب أوّلًا.
 *
 * ★★ لماذا واتساب بالاسم لا «مشاركة» وحدها: هو قناة التوزيع الأولى
 * في السوق المستهدف. التاجر يرسل منتجه لزبائنه، والزبون يرسله
 * لصاحبه — توزيعٌ مجّاني كان ينقصه زرّ.
 *
 * ★ والرابط يُقرأ من `location.href` لا يُبنى في الخادم: الصفحة
 * مخزَّنة وواحدة لكل الزوّار، فبناء الرابط فيها يعني حقن قيمة في
 * HTML مشترك. وقراءته في المتصفّح تعطي الدومين الذي يراه الزائر
 * فعلًا — دومين التاجر الخاص إن كان عنده واحد.
 *
 * ★ ونسخ الرابط بديلٌ حاضر: لا نفترض أن واتساب مثبَّت.
 */
export function ShareProduct() {
  const [copied, setCopied] = useState(false);

  /**
   * ★★ الرابط مفكوك الترميز للعرض: سَلَك المنتج عربيّ، فيظهر في
   * الرسالة سطرًا من `%D8%A7%D8%AF...` لا يقرؤه أحد ولا يُطمئن من
   * يستقبله. وفكّه يُظهره بالعربية، والتطبيقات تعيد ترميزه عند الفتح
   * فالوجهة واحدة. و`decodeURI` لا `decodeURIComponent`: الثانية تفكّ
   * الشرطات المائلة وعلامة الاستفهام فتكسر الرابط.
   */
  const href = () => {
    if (typeof window === 'undefined') return '';
    const raw = window.location.href;
    try { return decodeURI(raw); } catch { return raw; }
  };

  /**
   * ★ الرابط وحده في الرسالة: الاسم والصورة والسعر تأتي من بطاقة
   * المعاينة نفسها، وتكرار الاسم فوقها حشوٌ يزيح البطاقة.
   */
  const toWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(href())}`,
      '_blank', 'noopener,noreferrer');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ★ المتصفّح قد يمنع الحافظة بلا إيماءة موثوقة أو بلا HTTPS.
      //   لا رسالة خطأ مزعجة: الزرّ الآخر يفي بالغرض.
    }
  };

  const base = 'inline-flex h-10 items-center gap-1.5 rounded-md border px-3.5 ' +
               'text-[13px] font-semibold transition-colors';

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-500">
        <Share2 size={14} aria-hidden /> شارك:
      </span>
      <button type="button" onClick={toWhatsapp}
              className={`${base} border-teal-600 text-teal-700 hover:bg-teal-50`}>
        واتساب
      </button>
      <button type="button" onClick={copy} aria-live="polite"
              className={`${base} border-ink-300 text-ink-700 hover:border-ink-400`}>
        {copied
          ? (<><Check size={14} aria-hidden /> نُسخ</>)
          : (<><Link2 size={14} aria-hidden /> نسخ الرابط</>)}
      </button>
    </div>
  );
}
