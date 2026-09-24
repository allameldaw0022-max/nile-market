import { Star } from 'lucide-react';

/**
 * نجوم التقييم — عرض فقط.
 *
 * ★ الكسر يُعرض كسرًا: ٤٫٣ ليست أربع نجوم ولا خمسًا. النجمة الجزئية
 * تُقصّ بعرض نسبي فوق نجمة فارغة، فلا تُقرَّب النتيجة لصالح التاجر.
 *
 * ★ ولا نجوم فارغة لمنتج بلا تقييم: خمس نجوم رمادية تُقرأ «قُيّم
 * بصفر». من لا تقييم له لا يُعرض له شريط أصلًا (المُستدعي يفحص).
 */
export function Stars({ value, size = 14, className = '' }: {
  value: number; size?: number; className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span className={`relative inline-flex shrink-0 align-middle ${className}`}
          aria-hidden>
      <span className="flex text-ink-200">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} strokeWidth={1.5} fill="currentColor" />
        ))}
      </span>
      {/* ★ `start-0` + `inset-y-0` لا `inset-0`: مع `inset-0` يصير
          الصندوق مُقيَّدًا أكثر من اللازم (يسار ويمين وعرض معًا)،
          فيحسم المتصفّح التعارض بإهمال أحد الطرفين حسب اتجاه
          الصفحة — أي أنّ جهة الامتلاء كانت تتحدّد بالصدفة. الآن
          يُملأ من جهة البداية: اليمين في العربية واليسار في غيرها. */}
      <span className="absolute inset-y-0 start-0 flex overflow-hidden text-gold-500"
            style={{ width: `${(clamped / 5) * 100}%` }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} strokeWidth={1.5} fill="currentColor"
                className="shrink-0" />
        ))}
      </span>
    </span>
  );
}

/** النجوم + المتوسّط + العدد في سطر واحد. */
export function RatingSummary({ avg, count, size = 14, showCount = true }: {
  avg: number | null; count: number; size?: number; showCount?: boolean;
}) {
  if (!count || avg == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stars value={Number(avg)} size={size} />
      <span className="text-[12px] font-semibold tabular text-ink-700">
        {Number(avg).toFixed(1)}
      </span>
      {showCount && (
        <span className="text-[12px] tabular text-ink-400">({count})</span>
      )}
      <span className="sr-only">
        متوسّط التقييم {Number(avg).toFixed(1)} من ٥ بناءً على {count} تقييمًا
      </span>
    </span>
  );
}
