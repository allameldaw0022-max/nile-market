'use client';
import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { submitProductReview } from '@/lib/reviews/actions';

const LABELS = ['', 'سيّئ', 'مقبول', 'جيّد', 'جيّد جدًا', 'ممتاز'];

/**
 * نموذج التقييم — لا يظهر إلا لمن أثبتت القاعدة شراءه.
 *
 * ★ لا يفحص هذا المكوّن شيئًا: الصفحة تسأل `product_review_state`
 * خادميًا فلا يُرسَل النموذج أصلًا لغير المشتري، والدالة ترفضه لو
 * أُرسل. الواجهة تشرح ولا تحرس.
 */
export function ReviewForm({
  host, productId, slug, initialRating, initialBody, hidden,
}: {
  host: string; productId: string; slug: string;
  initialRating: number | null; initialBody: string | null;
  /** التاجر أخفى هذا التقييم — يُقال لصاحبه بوضوح. */
  hidden: boolean;
}) {
  const [rating, setRating] = useState(initialRating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(initialBody ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const editing = initialRating != null;
  const shown = hover || rating;

  const send = () => {
    setError(null);
    setDone(false);
    if (rating < 1) {
      setError('اختر عدد النجوم أولًا');
      return;
    }
    start(async () => {
      const res = await submitProductReview({
        host, productId, slug, rating, body: body.trim() || null,
      });
      if (res.ok) setDone(true);
      else setError(res.message);
    });
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 sm:p-5">
      <h3 className="text-[15px] font-bold text-ink-900">
        {editing ? 'عدّل تقييمك' : 'قيّم هذا المنتج'}
      </h3>
      <p className="mt-1 text-[13px] text-ink-500">
        اشتريتَ هذا المنتج — رأيك يساعد بقية الزبائن.
      </p>

      {hidden && (
        <Alert tone="warning" className="mt-3">
          أخفى المتجر هذا التقييم، فلا يظهر لبقية الزوّار. تعديلك محفوظ
          لكنه يبقى مخفيًّا.
        </Alert>
      )}

      {/* ★ أزرار حقيقية لا أيقونات: يمكن بلوغها بالـTab وتفعيلها
          بالمسافة، ولكلّ نجمة اسم مقروء. */}
      <div className="mt-4 flex items-center gap-2">
        <div dir="ltr" className="flex items-center gap-0.5"
             onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} من ٥ — ${LABELS[n]}`}
                    aria-pressed={rating === n} disabled={pending}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(0)}
                    onClick={() => setRating(n)}
                    className="grid size-11 place-items-center rounded-md
                               text-ink-200 transition-colors
                               hover:text-gold-500 focus-visible:text-gold-500
                               disabled:opacity-60">
              <Star size={24} strokeWidth={1.5}
                    fill={n <= shown ? 'currentColor' : 'none'}
                    className={n <= shown ? 'text-gold-500' : undefined} />
            </button>
          ))}
        </div>
        {shown > 0 && (
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink-700">
            {LABELS[shown]}
          </span>
        )}
      </div>

      <label className="mt-4 block">
        <span className="text-[13px] font-semibold text-ink-700">
          تعليقك (اختياري)
        </span>
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)}
          rows={3} maxLength={1000} disabled={pending}
          placeholder="ما الذي أعجبك أو لم يعجبك؟"
          className="mt-1.5 w-full rounded-md border border-ink-200 bg-white p-3
                     text-[14px] leading-relaxed text-ink-900
                     placeholder:text-ink-400 focus:border-teal-600
                     focus:outline-none disabled:opacity-60" />
        {/* ★ `dir="ltr"` وإلا قلبت الصفحة العربية العدّاد فقُرئ
            «1000 / 24» — أي أنّ الحدّ هو المكتوب والعكس. */}
        <span dir="ltr" className="mt-1 block text-end text-[11px] tabular
                                   text-ink-400">
          {body.length} / 1000
        </span>
      </label>

      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
      {done && (
        <Alert tone="success" className="mt-3">
          {editing ? 'حُدّث تقييمك.' : 'شكرًا — نُشر تقييمك.'}
        </Alert>
      )}

      <div className="mt-4">
        <Button type="button" onClick={send} loading={pending}>
          {editing ? 'حفظ التعديل' : 'إرسال التقييم'}
        </Button>
      </div>
    </div>
  );
}
