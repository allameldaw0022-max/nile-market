'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toggleWishlist } from '@/lib/wishlist/actions';

/**
 * زرّ المفضّلة.
 *
 * ★ الحالة لا تُنقل باللون وحده (§27): القلب **ممتلئ** حين يكون
 * المنتج محفوظًا وفارغ حين لا يكون، و`aria-pressed` يخبر قارئ
 * الشاشة، و`aria-label` يتغيّر نصّه. أي أن الفرق شكلٌ ونصٌّ وحالةٌ
 * دلالية — لا درجة لون.
 *
 * ★ التحديث متفائل ثم يُراجَع: القلب يمتلئ فورًا فلا تبدو الواجهة
 * بطيئة، ويعود إلى حاله إن رفض الخادم. ما يُعرض للمستخدم هو نتيجة
 * الخادم لا تفاؤل الواجهة.
 *
 * ★ الزائر يُوجَّه إلى دخول المنصّة بعنوان **مطلق**: على نطاق متجر
 * يُعاد كتابة `/login` إلى `/sites/<host>/login` وهو مسار غير موجود،
 * فرابط نسبيّ هنا يعطي 404. والدخول يعيش على نطاق المنصّة وحده.
 */
export function WishlistButton({
  host, productId, label, initial, signedIn, variant = 'icon',
}: {
  host: string; productId: string; label: string;
  initial: boolean; signedIn: boolean;
  variant?: 'icon' | 'full';
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!signedIn) {
      const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
      window.location.href = root ? `https://${root}/login` : '/login';
      return;
    }

    const optimistic = !saved;
    setSaved(optimistic);
    setError(null);

    start(async () => {
      const res = await toggleWishlist({ host, productId });
      if (!res.ok) {
        setSaved(!optimistic);          // الخادم هو المرجع
        setError(res.message);
        return;
      }
      setSaved(res.data.inWishlist);
      router.refresh();
    });
  };

  const text = saved ? 'محفوظ في المفضّلة' : 'احفظ في المفضّلة';

  if (variant === 'full') {
    return (
      <div>
        <button
          type="button" onClick={act} disabled={pending}
          aria-pressed={signedIn ? saved : undefined}
          className={cn(
            'inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4',
            'text-[14px] font-semibold transition-colors disabled:opacity-60',
            saved
              ? 'border-teal-600 bg-teal-50 text-teal-700'
              : 'border-ink-200 bg-white text-ink-900 hover:border-teal-600 hover:text-teal-700',
          )}
        >
          {pending
            ? <Loader2 size={17} className="animate-spin" aria-hidden />
            : <Heart size={17} aria-hidden fill={saved ? 'currentColor' : 'none'} />}
          {text}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button" onClick={act} disabled={pending}
      aria-pressed={signedIn ? saved : undefined}
      aria-label={`${text}: ${label}`}
      title={error ?? text}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-sm border bg-white',
        'transition-colors disabled:opacity-60',
        error
          ? 'border-danger text-danger'
          : saved
            ? 'border-teal-600 text-teal-700'
            : 'border-ink-200 text-ink-500 hover:border-teal-600 hover:text-teal-700',
      )}
    >
      {pending
        ? <Loader2 size={16} className="animate-spin" aria-hidden />
        : <Heart size={16} aria-hidden fill={saved ? 'currentColor' : 'none'} />}
    </button>
  );
}
