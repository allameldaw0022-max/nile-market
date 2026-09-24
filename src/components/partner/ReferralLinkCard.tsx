'use client';
import { useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * رابط الإحالة — أهمّ ما يراه الشريك، ولذلك أعلى الصفحة وحده.
 *
 * ★ الرابط القصير هو المعروض؛ الرابط الطويل يبقى صالحًا إلى الأبد
 * ويظهر مطويًا لمن يحتاجه (روابط منشورة سابقًا لا تُكسر).
 */
export function ReferralLinkCard({ shortLink, legacyLink, rate }: {
  shortLink: string | null; legacyLink: string; rate: number;
}) {
  const primary = shortLink ?? legacyLink;
  const [copied, setCopied] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* الحافظة محجوبة */ }
  };

  const share = async () => {
    // مشاركة النظام إن توفّرت — وإلا نسخ، فلا يبقى الزر بلا أثر
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'سوق النيل',
          text: 'أنشئ متجرك على سوق النيل',
          url: primary,
        });
        return;
      } catch { /* أُلغيت المشاركة */ }
    }
    await copy(primary);
  };

  return (
    <section className="rounded-lg border border-teal-600 bg-teal-50 p-4 sm:p-5">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <Link2 size={15} /> رابط الإحالة الخاص بك
      </p>

      <p dir="ltr"
         className="mt-2 overflow-x-auto rounded-md border border-teal-600/40
                    bg-white px-3 py-3 text-center text-[15px] font-extrabold
                    tabular text-teal-700">
        {primary}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => copy(primary)}
                icon={copied === primary ? <Check size={15} /> : <Copy size={15} />}>
          {copied === primary ? 'نُسخ' : 'نسخ الرابط'}
        </Button>
        <Button type="button" onClick={share} icon={<Share2 size={15} />}>
          مشاركة
        </Button>
      </div>

      <p className="mt-3 text-xs text-ink-600">
        كل متجر يأتي من خلال رابطك يبقى مرتبطًا بك، وتحصل على{' '}
        <span className="font-bold tabular">{rate}%</span> عند كل دفعة اشتراك
        مؤكدة وفق نظام المنصة.
      </p>

      {shortLink && (
        <>
          <button type="button" onClick={() => setShowLegacy((v) => !v)}
                  className="mt-2 text-xs font-bold text-teal-700 hover:underline">
            {showLegacy ? 'إخفاء الرابط الطويل' : 'الرابط الطويل (يعمل أيضًا)'}
          </button>
          {showLegacy && (
            <div className="mt-2 flex items-center gap-2">
              <code dir="ltr"
                    className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5
                               text-xs text-ink-700">{legacyLink}</code>
              <button type="button" onClick={() => copy(legacyLink)}
                      aria-label="نسخ الرابط الطويل"
                      className="rounded p-1.5 text-ink-500 hover:text-teal-700">
                {copied === legacyLink ? <Check size={14} className="text-success" />
                                       : <Copy size={14} />}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
