import Link from 'next/link';
import { BadgeCheck, MessageSquare } from 'lucide-react';
import { formatDate } from '@/lib/money/format';
import { Stars } from './Stars';
import { ReviewForm } from './ReviewForm';

export type PublicReview = {
  id: string; rating: number; body: string | null;
  author_name: string; created_at: string;
};

export type ReviewViewerState = {
  canReview: boolean;
  reason: 'auth' | 'unavailable' | 'not_purchased' | null;
  myRating: number | null;
  myBody: string | null;
  myHidden: boolean;
};

/**
 * قسم التقييمات في صفحة المنتج.
 *
 * ★ كل تقييم هنا شراءٌ موثّق بحكم البناء: لا مسار كتابة إلا دالة
 * تُثبت وجود طلب حقيقي بهذا المنتج باسم صاحب التقييم. فالشارة ليست
 * وعدًا تسويقيًا بل وصفٌ لما تفرضه القاعدة.
 */
export function ProductReviews({
  host, productId, slug, avg, count, reviews, viewer,
}: {
  host: string; productId: string; slug: string;
  avg: number | null; count: number;
  reviews: PublicReview[];
  viewer: ReviewViewerState;
}) {
  return (
    <section className="mt-12 border-t border-ink-200 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-bold text-ink-900 sm:text-[20px]">
          تقييمات المنتج
        </h2>
        {count > 0 && avg != null && (
          <div className="flex items-center gap-2">
            <Stars value={avg} size={17} />
            <span className="text-[15px] font-bold tabular text-ink-900">
              {avg.toFixed(1)}
            </span>
            <span className="text-[13px] tabular text-ink-500">
              من {count} تقييمًا
            </span>
          </div>
        )}
      </div>

      {/* ★ لا نجوم فارغة لمنتج لم يُقيَّم: خمس نجوم رمادية تُقرأ
          «قُيّم بصفر»، وهذا ظلم لمنتج جديد. */}
      {count === 0 && (
        <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-500">
          <MessageSquare size={16} aria-hidden />
          لا توجد تقييمات بعد — كن أول من يقيّمه بعد شرائه.
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          {reviews.length > 0 && (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-ink-200 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars value={r.rating} size={14} />
                    <span className="text-[13px] font-semibold text-ink-900">
                      {r.author_name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px]
                                     font-semibold text-teal-700">
                      <BadgeCheck size={13} aria-hidden />
                      شراء موثّق
                    </span>
                    <span className="ms-auto text-[12px] tabular text-ink-400">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                  {r.body && (
                    <p className="mt-2 whitespace-pre-line text-[14px]
                                  leading-relaxed text-ink-700">
                      {r.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {viewer.canReview ? (
            <ReviewForm host={host} productId={productId} slug={slug}
                        initialRating={viewer.myRating}
                        initialBody={viewer.myBody}
                        hidden={viewer.myHidden} />
          ) : (
            <ViewerNote reason={viewer.reason} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * ★ لا يفضح شيئًا: «لم نجد طلبًا» تُقال لمن سجّل دخوله عن نفسه فقط،
 * ولا تُكشف حالة طلب أحد لأحد.
 */
function ViewerNote({ reason }: { reason: ReviewViewerState['reason'] }) {
  if (reason === 'auth') {
    return (
      <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
        <p className="text-[14px] font-semibold text-ink-900">
          التقييم لمن اشترى المنتج
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
          سجّل دخولك بالحساب الذي اشتريتَ به ليظهر لك نموذج التقييم.
        </p>
        <Link href="/login"
              className="mt-3 inline-flex h-10 items-center rounded-md border
                         border-ink-200 bg-white px-4 text-[13px] font-semibold
                         text-ink-900 transition-colors hover:border-teal-600
                         hover:text-teal-700">
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
      <p className="text-[14px] font-semibold text-ink-900">
        التقييم لمن اشترى المنتج
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
        لم نجد لك طلبًا مكتملًا يحتوي هذا المنتج. بعد استلام طلبك يظهر
        لك نموذج التقييم هنا.
      </p>
    </div>
  );
}
