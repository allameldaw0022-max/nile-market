'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { publishStore } from '@/app/(platform)/onboarding/actions';

/**
 * نشر المتجر من اللوحة.
 *
 * ★★ سبب وجوده: النشر كان يعيش في معالج الإنشاء وحده. من غادره قبل
 * خطوته الأخيرة يبقى متجره `draft` إلى الأبد بلا أي زرّ نشر في
 * اللوحة — فيفتح رابطه ويجد صفحة «غير موجودة» ولا يعرف السبب.
 *
 * ★ الشروط تُفحص في القاعدة (`publish_store`) لا هنا، وهي تسمّي
 * النواقص بالعربية في ناتجها. فتُعرض كما جاءت: أي قائمة أسماء هنا
 * نسخة ثانية تشيخ عند أول شرط جديد تضيفه القاعدة.
 */
export function PublishBanner({ storeId, host }: {
  storeId: string; host: string | null;
}) {
  const router = useRouter();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const publish = () => start(async () => {
    setError(null);
    setMissing(null);
    const res = await publishStore(storeId);
    if (!res.ok) { setError(res.message); return; }
    if (!res.data.published) { setMissing(res.data.missing); return; }
    setDone(true);
    router.refresh();
  });

  if (done) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border
                      border-success/30 bg-success-bg p-4">
        <CheckCircle2 size={20} className="shrink-0 text-success" />
        <p className="min-w-0 flex-1 text-sm font-bold text-ink-900">
          نُشر متجرك — صار متاحًا للزبائن الآن.
        </p>
        {host && (
          <a href={`https://${host}`} target="_blank" rel="noopener noreferrer"
             className="text-sm font-bold text-teal-700 hover:underline">
            افتح متجرك
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gold-500/40 bg-gold-300/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Rocket size={20} className="shrink-0 text-gold-700" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-900">متجرك لم يُنشر بعد</p>
          <p className="mt-0.5 text-sm text-ink-600">
            الزبائن لا يرونه حتى تنشره
            {host && <span dir="ltr"> — {host}</span>}
          </p>
        </div>
        <Button loading={pending} icon={<Rocket size={15} />} onClick={publish}>
          نشر المتجر
        </Button>
      </div>

      {missing && missing.length > 0 && (
        <div className="mt-3 rounded-md border border-ink-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
            <AlertTriangle size={14} className="text-gold-700" />
            ينقص متجرك قبل النشر:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
