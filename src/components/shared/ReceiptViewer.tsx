'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, ExternalLink, Eye, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ActionResult } from '@/lib/action-result';

/**
 * عرض إيصال تحويل بربط موقَّع قصير العمر.
 *
 * ★ الرابط لا يُطلب إلا عند الضغط، ولا يُخزَّن، ولا يُوضع في HTML
 * الصفحة: صفحة قائمة فيها عشرة إيصالات كانت ستحمل عشرة روابط صالحة
 * لمن التقط مصدر الصفحة. وعمره دقيقتان — يكفي للنظر ولا يصلح
 * للمشاركة.
 *
 * ★ الفعل الخادمي هو من يقرّر: لا مسار ولا معرّف ملف يُرسل من هنا،
 * بل معرّف العملية وحده.
 */
export function ReceiptViewer({ load, mime, label = 'عرض الإيصال' }: {
  load: () => Promise<ActionResult<{ url: string; mime: string }>>;
  /** النوع المعروف مسبقًا — يوفّر نداءً لمعرفة أهو PDF. */
  mime?: string | null;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(mime ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = () => start(async () => {
    setError(null);
    const res = await load();
    if (!res.ok) { setError(res.message); return; }
    setUrl(res.data.url);
    setKind(res.data.mime);
  });

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
        <AlertTriangle size={13} /> {error}
      </p>
    );
  }

  if (!url) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={open}
              loading={pending}
              icon={pending ? <Loader2 size={14} /> : <Eye size={14} />}>
        {label}
      </Button>
    );
  }

  const isPdf = kind === 'application/pdf';

  return (
    <div className="space-y-2">
      {isPdf ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1.5 rounded-md border
                      border-ink-200 px-3 py-2 text-sm font-bold text-teal-700
                      hover:border-teal-500">
          <FileText size={15} /> فتح ملف الإيصال (PDF)
        </a>
      ) : (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer"
             className="block overflow-hidden rounded-md border border-ink-200">
            {/* ★ <img> خام عمدًا: الرابط موقَّع ومؤقّت، ومُحسِّن Next
                يقبل المسار العام وحده — وتمريره إليه يعني كسر العرض
                أو فتح مسار موقَّع للتخزين المؤقّت. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="إيصال التحويل" width={640} height={480}
                 className="h-auto w-full max-w-sm object-contain" />
          </a>
          <a href={url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-xs font-bold
                        text-teal-700 hover:underline">
            <ExternalLink size={12} /> فتح بالحجم الكامل
          </a>
        </>
      )}
      <p className="text-xs text-ink-500">
        الرابط مؤقّت وينتهي خلال دقيقتين.
      </p>
    </div>
  );
}
