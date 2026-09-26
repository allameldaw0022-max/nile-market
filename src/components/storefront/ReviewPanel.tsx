'use client';
import Link from 'next/link';
import { ReviewForm } from './ReviewForm';
import { useViewer } from './ViewerProvider';
import type { ReviewViewerState } from './ProductReviews';

/**
 * نموذج التقييم أو سبب تعذّره — من حالة الزائر على العميل.
 *
 * ★★ سببه أداءٌ مقيس لا ذوق: `product_review_state` تسأل «هل لهذا
 * الزائر طلبٌ يحتوي هذا المنتج؟» — سؤالٌ عن شخص بعينه. وجوده في
 * شجرة التصيير كان يمنع تخزين صفحة المنتج، وهي ٣٠٪ من حركة المتجر
 * في مزيج الرحلة المقيس.
 *
 * ★ والحالة الابتدائية «لا يحقّ لك بعد» مع سبب `auth` — وهي الحالة
 * الصحيحة للزائر غير المسجَّل، أي لأغلب من يُخدَم من التخزين. ومن
 * يحقّ له يرى النموذج بعد جلبة `/viewer` القصيرة.
 *
 * ★ ولا يُقرَّر شيء هنا: القاعدة وحدها تقبل التقييم أو ترفضه
 * (`submit_product_review` تُثبت الشراء)، فما يظهر أو يختفي هنا
 * واجهةٌ لا سلطة.
 */
export function ReviewPanel({ host, productId, slug }: {
  host: string; productId: string; slug: string;
}) {
  const { review } = useViewer();

  if (review?.canReview) {
    return (
      <div className="min-w-0">
        <ReviewForm host={host} productId={productId} slug={slug}
                    initialRating={review.myRating}
                    initialBody={review.myBody}
                    hidden={review.myHidden} />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <ViewerNote reason={(review?.reason ?? 'auth') as ReviewViewerState['reason']} />
    </div>
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
