'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { StoreLogoUploader } from '@/components/dashboard/MediaUploader';
import { saveStoreLogo } from '@/lib/settings/actions';

/**
 * شعار المتجر في الإعدادات.
 *
 * ★★★ لماذا وُجدت: `stores.logo_url` كان يُكتب في **معالج الإنشاء
 * وحده**. فتاجرٌ رفع شعارًا خاطئًا — أو لقطة شاشة — لا سبيل له
 * لتغييره من اللوحة إطلاقًا، ولا الدعم يملك أن يطلب منه ذلك.
 * (مُشاهَد في الإنتاج قبل هذه الشاشة.)
 *
 * ★ والحفظ فور الرفع لا بزرٍّ ثالث، والحالة تتبع ما حُفظ لا ما رُفع —
 *   نفس قاعدة الغلاف حرفيًّا.
 */
export function StoreLogoForm({ storeId, initialUrl, canEdit }: {
  storeId: string; initialUrl: string | null; canEdit: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const persist = (next: string | null) => {
    const previous = url;
    setUrl(next);
    setSaved(false);
    setError(null);
    start(async () => {
      const res = await saveStoreLogo({ storeId, url: next });
      if (res.ok) setSaved(true);
      else { setUrl(previous); setError(res.message); }
    });
  };

  return (
    <Card>
      <CardHeader title="شعار المتجر"
                  description="يظهر في أعلى متجرك، وأيقونةً على شاشة زبونك حين يثبّت المتجر." />
      <div className="space-y-3 p-5">
        <fieldset disabled={!canEdit || pending}>
          <StoreLogoUploader
            storeId={storeId} currentUrl={url}
            onUploaded={(next) => persist(next)}
            onRemove={canEdit ? () => persist(null) : undefined} />
        </fieldset>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md border
                         border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="flex items-center gap-1.5 text-sm
                         font-semibold text-success">
            <Check size={15} /> حُفظ الشعار
          </p>
        )}
      </div>
    </Card>
  );
}
