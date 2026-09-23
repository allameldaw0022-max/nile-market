'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  beginAttachmentUpload, completeAttachmentUpload,
} from '@/lib/support/attachments';
import { cn } from '@/lib/cn';

/**
 * إرفاق ملف بتذكرة دعم.
 *
 * ★ نفس نمط الرفع على مرحلتين المعتمد في `MediaUploader`: القاعدة
 * تحضّر المسار، والمتصفّح يرفع مباشرةً إلى Storage، ثم يُربط الملف.
 * لا نظام رفع ثانٍ ولا مسار موازٍ.
 *
 * ★ الحالة لا تُنقل باللون وحده (§27): لكل حالة أيقونة ونصّ —
 * «يُرفع…» و«أُرفق» و«تعذّر» — و`role="status"` لقارئ الشاشة.
 *
 * ★ الفحص هنا مبكّر لرسالة واضحة فقط؛ الحاجز الفعلي في القاعدة
 * وسياسات التخزين، ولا يُعتمد على الواجهة إطلاقًا.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,text/plain';
const MAX_BYTES = 10 * 1024 * 1024;

type Item = {
  key: string; name: string; size: number;
  state: 'uploading' | 'done' | 'error';
  message?: string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

export function AttachmentUploader({ ticketId, disabled }: {
  ticketId: string; disabled?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);

  function patch(key: string, next: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...next } : i)));
  }

  async function upload(file: File) {
    const key = `${file.name}-${Date.now()}-${Math.random()}`;
    setItems((prev) => [...prev, {
      key, name: file.name, size: file.size, state: 'uploading',
    }]);

    if (file.size > MAX_BYTES) {
      patch(key, { state: 'error', message: 'الحجم يتجاوز ١٠ ميجابايت' });
      return;
    }

    const ticket = await beginAttachmentUpload({
      ticketId, mime: file.type, size: file.size,
    });
    if (!ticket.ok) {
      patch(key, { state: 'error', message: ticket.message });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.storage
      .from(ticket.data.bucket)
      .upload(ticket.data.path, file, { contentType: file.type, upsert: false });

    if (error) {
      patch(key, { state: 'error', message: 'تعذّر الرفع — تحقّق من الاتصال' });
      return;
    }

    const done = await completeAttachmentUpload({
      ticketId, mediaId: ticket.data.mediaId,
    });
    if (!done.ok) {
      patch(key, { state: 'error', message: done.message });
      return;
    }

    patch(key, { state: 'done' });
    router.refresh();
  }

  return (
    <div>
      <input
        ref={input} type="file" accept={ACCEPT} multiple className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          files.slice(0, 5).forEach((f) => void upload(f));
        }}
      />

      <button
        type="button" disabled={disabled}
        onClick={() => input.current?.click()}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-md border border-ink-200',
          'bg-white px-3.5 text-[14px] font-medium text-ink-700 transition-colors',
          'hover:border-teal-600 hover:text-teal-700',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Paperclip size={16} aria-hidden />إرفاق ملف
      </button>
      <p className="mt-1.5 text-[12px] text-ink-500">
        صور أو PDF أو نصّ — حتى ١٠ ميجابايت لكل ملف.
      </p>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2" role="status" aria-live="polite">
          {items.map((i) => (
            <li key={i.key}
                className={cn(
                  'flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]',
                  i.state === 'error'
                    ? 'border-danger/30 bg-danger-bg'
                    : i.state === 'done'
                      ? 'border-success/30 bg-success-bg'
                      : 'border-ink-200 bg-white',
                )}>
              {i.state === 'uploading'
                ? <Loader2 size={15} className="shrink-0 animate-spin text-ink-500" aria-hidden />
                : i.state === 'done'
                  ? <Check size={15} className="shrink-0 text-success" aria-hidden />
                  : <AlertTriangle size={15} className="shrink-0 text-danger" aria-hidden />}

              <span className="min-w-0 flex-1 truncate text-ink-900">{i.name}</span>
              <span className="shrink-0 tabular text-ink-500">{humanSize(i.size)}</span>
              <span className={cn('shrink-0 font-medium',
                i.state === 'error' ? 'text-danger'
                : i.state === 'done' ? 'text-success' : 'text-ink-500')}>
                {i.state === 'uploading' ? 'يُرفع…'
                  : i.state === 'done' ? 'أُرفق' : (i.message ?? 'تعذّر')}
              </span>

              {i.state !== 'uploading' && (
                <button type="button" aria-label={`إزالة ${i.name} من القائمة`}
                        onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}
                        className="grid size-6 shrink-0 place-items-center rounded-xs
                                   text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** قائمة المرفقات المحفوظة في التذكرة — التنزيل برابط موقَّع. */
export function AttachmentList({ ticketId, items }: {
  ticketId: string;
  items: { id: string; mime: string; size: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-[13px] font-semibold text-ink-900">المرفقات</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((a) => (
          <li key={a.id}>
            <AttachmentRow ticketId={ticketId} id={a.id} mime={a.mime} size={a.size} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttachmentRow({ ticketId, id, mime, size }: {
  ticketId: string; id: string; mime: string; size: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = mime.startsWith('image/') ? 'صورة'
    : mime === 'application/pdf' ? 'ملف PDF' : 'ملف نصّي';

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-ink-200
                    bg-white px-3 py-2 text-[13px]">
      <FileText size={15} className="shrink-0 text-ink-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-ink-900">{label}</span>
      <span className="shrink-0 tabular text-ink-500">{humanSize(size)}</span>
      <button
        type="button" disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null);
          const { attachmentUrl } = await import('@/lib/support/attachments');
          const res = await attachmentUrl({ ticketId, attachmentId: id });
          setBusy(false);
          if (!res.ok) { setError(res.message); return; }
          window.open(res.data.url, '_blank', 'noopener,noreferrer');
        }}
        className="shrink-0 font-medium text-teal-700 underline underline-offset-4
                   disabled:opacity-60"
      >
        {busy ? 'يُجهَّز…' : 'فتح'}
      </button>
      {error && <span role="alert" className="shrink-0 text-danger">{error}</span>}
    </div>
  );
}
