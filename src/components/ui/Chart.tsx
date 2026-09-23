import { cn } from '@/lib/cn';

export type Point = { label: string; value: number };

/**
 * رسوم بـSVG خالص — بلا مكتبة ولا JS على العميل.
 *
 * ★ الإتاحة: الرسم زخرفة بصرية لقارئ الشاشة (`aria-hidden`)، والبيانات
 * نفسها تُقدَّم في جدول مخفيّ بصريًا. قارئ الشاشة يقرأ الأرقام لا
 * «رسم بياني»، وهو ما ينفعه فعلًا.
 *
 * ★ RTL: الزمن يتقدّم من اليمين إلى اليسار في واجهة عربية، فالعمود
 * الأحدث يمينًا. عكسه يجعل القارئ العربي يقرأ الاتجاه معكوسًا.
 */
export function BarChart({ data, format, label, className, height = 160 }: {
  data: Point[];
  format?: (v: number) => string;
  label: string;
  className?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = format ?? ((v: number) => String(v));

  return (
    <figure className={cn('m-0', className)}>
      <div
        className="flex items-end gap-[3px]"
        style={{ height }}
        aria-hidden
      >
        {/* الأحدث يمينًا: نعكس ترتيب العرض في الاتجاه الطبيعي لـRTL */}
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * 100, d.value > 0 ? 3 : 1);
          return (
            <span
              key={`${d.label}-${i}`}
              title={`${d.label}: ${fmt(d.value)}`}
              className={cn(
                'flex-1 rounded-t-[3px] transition-[height] duration-300',
                d.value > 0 ? 'bg-teal-500' : 'bg-ink-200',
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>{label}</caption>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.label}-${i}`}>
                <th scope="row">{d.label}</th>
                <td>{fmt(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/**
 * خطّ اتجاه مصغّر. يُرسم مسارًا واحدًا — لا محاور ولا شبكة:
 * المقصود شكل الاتجاه لا قراءة القيم، والقيم مجاورة له نصًّا.
 */
export function Sparkline({ data, label, className }: {
  data: number[]; label: string; className?: string;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const W = 100, H = 28;
  // x يتقدّم يمينًا→يسارًا بصريًا عبر `scale(-1,1)` على الحاوية
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-7 w-full -scale-x-100', className)}
         role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
