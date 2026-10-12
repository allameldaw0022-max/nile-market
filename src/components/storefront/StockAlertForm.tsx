'use client';
import { useState, useTransition } from 'react';
import { BellRing, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestStockAlert } from '@/lib/stock/actions';

/**
 * «نبّهني عند التوفّر» — بديل زرٍّ معطَّل.
 *
 * ★★ لماذا: «نفدت الكمّية» نهايةُ طريق. والزبون الذي أراد المنتج
 * فعلًا هو أثمن زائر في الصفحة، وكان يُصرَف بلا أثر. والتنبيه يحوّله
 * إلى عودةٍ مؤكَّدة حين يعود المنتج.
 *
 * ★ ولا وعدَ بلا تنفيذ: العودة إلى المخزون تُدرج البريد في الطابور
 * القائم (`email_outbox`) الذي ترسله مهمّة البريد — لا قائمةُ بُرُدٍ
 * تُجمَع ولا يُنبَّه أحد.
 */
export function StockAlertForm({ productId }: { productId: string }) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-md border
                    border-teal-600 bg-teal-50 p-3.5 text-sm font-bold text-teal-800">
        <Check size={16} aria-hidden />
        سنراسلك فور عودته.
      </p>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await requestStockAlert({ productId, email });
          if (!res.ok) { setError(res.message); return; }
          setDone(true);
        });
      }}
    >
      <p className="rounded-md border border-ink-300 bg-ink-100 p-3.5 text-center
                    text-sm font-bold text-ink-600">
        نفدت الكمّية
      </p>
      <label htmlFor="stock-alert-email" className="block text-[13px] text-ink-600">
        اترك بريدك ونُنبّهك فور عودته:
      </label>
      <div className="flex gap-2">
        <input
          id="stock-alert-email"
          type="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          /* ★★ `w-full` ضروريّ مع `flex-1 min-w-0`: لـ`<input>` عرضٌ
             ذاتيّ من `size=20` (٣٠٦ بكسل هنا). و`min-w-0` يسمح له
             بالانكماش داخل المساحة المتاحة، لكنّه **لا يمنع** عرضه
             الذاتيّ من المساهمة في `min-content` — وعمود الشبكة
             يُقاس بـ`min-content`. فكان صفّ الحقل والزرّ يطلب ٤٠٥
             بكسل على شاشة ٣٦٠، فتتمدّد صفحة المنتج كلّها وتتمرّر
             أفقيًّا على كل هاتف. و`w-full` يُسقط العرض الذاتيّ. */
          className="h-11 w-full min-w-0 flex-1 rounded-md border border-ink-300
                     bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400"
        />
        <Button type="submit" loading={pending} icon={<BellRing size={16} />}>
          نبّهني
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">{error}</p>
      )}
    </form>
  );
}
