'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { StoreCoverUploader } from '@/components/dashboard/MediaUploader';
import { saveStoreCover } from '@/lib/settings/actions';

/**
 * غلاف المتجر في الإعدادات.
 *
 * ★ الحفظ يقع فور الرفع لا بزرّ ثالث: الرفع نفسه فعلٌ صريح، وزرّ
 * «حفظ» بعده يترك المتجر برابط صورة مرفوعة غير مربوطة إن نسيه
 * التاجر — وهو ما يحدث فعلًا.
 *
 * ★ والحالة المحلّية تتبع ما حُفظ لا ما رُفع: لو فشل الحفظ عادت
 * المعاينة إلى القيمة السابقة، فلا تَعِد الشاشة بما ليس في القاعدة.
 */
export function StoreCoverForm({ storeId, initialUrl, canEdit }: {
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
      const res = await saveStoreCover({ storeId, url: next });
      if (res.ok) setSaved(true);
      else { setUrl(previous); setError(res.message); }
    });
  };

  return (
    <Card>
      <CardHeader title="غلاف المتجر"
                  description="يظهر خلف اسم متجرك في أعلى الصفحة الرئيسية." />
      <div className="space-y-3 p-5">
        <fieldset disabled={!canEdit || pending}>
          <StoreCoverUploader
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
            <Check size={15} /> حُفظ الغلاف
          </p>
        )}
      </div>
    </Card>
  );
}
