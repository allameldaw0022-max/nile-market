'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toggleWishlist } from '@/lib/wishlist/actions';
import { useViewer } from './ViewerProvider';

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
 * ★ الزائر يُوجَّه إلى دخول **هذا المتجر** بمسار نسبيّ: صفحة
 * `/sites/[host]/login` صارت موجودة، والجلسة تُكتب على مضيف المتجر
 * فيعود الزبون إلى الصفحة نفسها مسجَّلًا.
 *
 * ★★ الحالة (محفوظ؟ ومسجَّل؟) من `ViewerProvider` لا من الخادم:
 * جلبها أثناء التصيير كان يعني `cookies()` داخل كل بطاقة منتج، أي
 * تصييرًا كاملًا لكل زائر لصفحات محتواها واحد للجميع. و`initial`
 * تبقى لمن يعرف الحالة خادميًا أصلًا (صفحة المفضّلة نفسها، وهي
 * صفحة خاصّة غير مخزَّنة).
 */
export function WishlistButton({
  host, productId, label, initial, signedIn: signedInProp, variant = 'icon',
}: {
  host: string; productId: string; label: string;
  initial?: boolean; signedIn?: boolean;
  variant?: 'icon' | 'full';
}) {
  const router = useRouter();
  const viewer = useViewer();
  const signedIn = signedInProp ?? viewer.signedIn;
  const fromServer = initial ?? viewer.saved.has(productId);
  const [saved, setSaved] = useState(fromServer);
  const [seen, setSeen] = useState(fromServer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // ★ الضبط أثناء الرسم لا داخل `useEffect`: حين تصل حالة المفضّلة من
  //   `/viewer` تَجُبّ الحالة الابتدائية، بلا دورة رسم ثانية.
  if (seen !== fromServer && !pending) {
    setSeen(fromServer);
    setSaved(fromServer);
  }

  const act = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!signedIn) {
      // مسار العودة يُنقّى خادميًا بـ`safeNext` قبل التحويل
      const next = encodeURIComponent(window.location.pathname);
      router.push(`/login?next=${next}`);
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
      setSeen(res.data.inWishlist);
      viewer.setSaved(productId, res.data.inWishlist);
      // ★ لا `router.refresh()`: الحالة كلّها في هذا الزرّ، وإعادة
      // بناء المسار لأجل قلب واحد كانت تعيد جلب الصفحة كاملة.
      // صفحة المفضّلة نفسها تُبطَّل خادميًا في الفعل.
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
