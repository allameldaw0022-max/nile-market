'use client';
import { useRef, useState } from 'react';
import {
  AlertTriangle, FileText, ImageIcon, Loader2, Paperclip, RefreshCw, Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/media/compress';
import { Button } from '@/components/ui/Button';
import type { ActionResult } from '@/lib/action-result';

/**
 * رفع إيصال التحويل — للتاجر (اشتراك المنصة) وللزبون (طلب المتجر).
 *
 * ★ المكوّن لا يعرف أيّ النظامين يخدم، ولا يملك صلاحية ولا مسارًا:
 * يستقبل `begin` (وربما `complete`) فعلين خادميّين يقرّران — كلٌّ
 * بشروطه — أين يُكتب الملف وهل يُسمح به أصلًا. فصل النظامين يبقى في
 * القاعدة، لا في زرّ في الواجهة.
 *
 * ★ الملف لا يمرّ بالخادم: يُرفع من المتصفح إلى المسار الذي أصدرته
 * القاعدة، فلا حدّ 4.5MB على Server Action ولا نقل مضاعف.
 *
 * ★ الصور تُضغط قبل الرفع؛ PDF يمرّ كما هو.
 */

export type ReceiptValue = {
  mediaId: string; name: string; size: number; mime: string;
};

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

type Phase = 'idle' | 'compressing' | 'uploading' | 'finalizing' | 'error';

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function ReceiptUploader({
  value, onChange, begin, complete, label, hint, disabled = false,
}: {
  value: ReceiptValue | null;
  onChange: (value: ReceiptValue | null) => void;
  begin: (input: { mime: string; size: number }) =>
    Promise<ActionResult<{ mediaId: string; bucket: string; path: string }>>;
  /** توسيم الملف جاهزًا حين يحتاجه النظام (الاشتراك). */
  complete?: (input: { mediaId: string; width: number | null; height: number | null }) =>
    Promise<ActionResult<unknown>>;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = phase === 'compressing' || phase === 'uploading' || phase === 'finalizing';

  const run = async (file: File) => {
    lastFile.current = file;
    setError(null);

    setPhase('compressing');
    const { blob, mime, width, height } = await compressImage(file);

    setPhase('uploading');
    const ticket = await begin({ mime, size: blob.size });
    if (!ticket.ok) { setError(ticket.message); setPhase('error'); return; }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(ticket.data.bucket)
      .upload(ticket.data.path, blob, { contentType: mime, upsert: false });
    if (uploadError) {
      setError('تعذّر رفع الإيصال — تحقق من الاتصال وحاول مرة أخرى');
      setPhase('error');
      return;
    }

    if (complete) {
      setPhase('finalizing');
      const done = await complete({
        mediaId: ticket.data.mediaId,
        width: width || null,
        height: height || null,
      });
      if (!done.ok) { setError(done.message); setPhase('error'); return; }
    }

    setPhase('idle');
    onChange({
      mediaId: ticket.data.mediaId,
      name: file.name,
      size: blob.size,
      mime,
    });
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(file);
  };

  const isPdf = value?.mime === 'application/pdf';

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-bold text-ink-700">
        {label} <span className="text-danger">*</span>
      </p>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-teal-600
                        bg-teal-50 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded
                           bg-white text-teal-700">
            {isPdf ? <FileText size={18} /> : <ImageIcon size={18} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink-900">
              {value.name}
            </span>
            <span className="block text-xs text-ink-500 tabular">
              {prettySize(value.size)} · أُرفق
            </span>
          </span>
          <button type="button" aria-label="إزالة الإيصال" disabled={disabled}
                  onClick={() => { onChange(null); setError(null); }}
                  className="rounded p-1.5 text-ink-500 hover:text-danger
                             disabled:opacity-50">
            <Trash2 size={16} />
          </button>
        </div>
      ) : (
        <button type="button" disabled={disabled || busy}
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-md
                           border border-dashed border-ink-300 p-4 text-sm
                           font-bold text-ink-600 hover:border-teal-500
                           hover:text-teal-700 disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          {phase === 'compressing' ? 'يجهّز الملف…'
            : phase === 'uploading' ? 'يرفع…'
            : phase === 'finalizing' ? 'يحفظ…'
            : 'اختر صورة الإيصال أو ملف PDF'}
        </button>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
             onChange={pick} />

      {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-2.5 text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          {/* الوصول إلى الملف في المعالج لا أثناء التصيير: لا يُقرأ
              مرجع في التصيير، ولا نُخزّن ملفًا في الحالة بلا داع. */}
          <Button type="button" variant="ghost" size="sm"
                  icon={<RefreshCw size={13} />}
                  onClick={() => { const f = lastFile.current; if (f) void run(f); }}>
            إعادة
          </Button>
        </div>
      )}
    </div>
  );
}
