'use client';
import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, ImagePlus, Loader2, RefreshCw, Star, Trash2, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { beginUpload, completeUpload } from '@/lib/media/actions';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { MediaPurpose } from '@/lib/supabase/rpc';
import { compressImage } from '@/lib/media/compress';

export type UploadedMedia = { mediaId: string; url: string };

type Purpose = Exclude<MediaPurpose,
  'avatar' | 'support_attachment' | 'order_payment_proof'>;

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

type State = 'idle' | 'compressing' | 'uploading' | 'finalizing' | 'error';

/**
 * يرفع ملفًا واحدًا ويعيد معرّف الوسيط ورابطه.
 * كل خطوة قابلة لإعادة المحاولة بمفردها: الفشل يترك الحالة في `error`
 * مع الملف محفوظًا في المرجع، ويكفي زر واحد للإعادة.
 */
function useUploader(storeId: string, purpose: Purpose) {
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastFile = useRef<File | null>(null);

  const run = useCallback(async (file: File): Promise<UploadedMedia | null> => {
    lastFile.current = file;
    setError(null);
    setProgress(0);

    setState('compressing');
    const { blob, mime, width, height } = await compressImage(file);

    setState('uploading');
    const ticket = await beginUpload({
      storeId, purpose, mime, size: blob.size,
    });
    if (!ticket.ok) {
      setError(ticket.message);
      setState('error');
      return null;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(ticket.data.bucket)
      .upload(ticket.data.path, blob, { contentType: mime, upsert: false });

    if (uploadError) {
      setError('تعذّر رفع الملف — تحقق من الاتصال وحاول مرة أخرى');
      setState('error');
      return null;
    }
    setProgress(100);

    setState('finalizing');
    const done = await completeUpload({
      storeId, mediaId: ticket.data.mediaId,
      width: width || null, height: height || null,
    });
    if (!done.ok) {
      setError(done.message);
      setState('error');
      return null;
    }
    if (!done.data.url) {
      setError('تم الرفع لكن تعذّر توليد رابط العرض');
      setState('error');
      return null;
    }

    setState('idle');
    return { mediaId: done.data.mediaId, url: done.data.url };
  }, [storeId, purpose]);

  const retry = useCallback(async () => {
    const file = lastFile.current;
    if (!file) return null;
    return run(file);
  }, [run]);

  return { state, progress, error, run, retry, setError };
}

function Busy({ state }: { state: State }) {
  const label =
    state === 'compressing' ? 'يجهّز الصورة…'
    : state === 'uploading' ? 'يرفع…'
    : state === 'finalizing' ? 'يحفظ…' : '';
  if (!label) return null;
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm font-bold text-ink-500">
      <Loader2 size={15} className="animate-spin" />{label}
    </span>
  );
}

function ErrorLine({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md
                    border border-danger/30 bg-danger-bg p-3
                    text-sm text-danger">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <Button type="button" variant="outline" size="sm" icon={<RefreshCw size={13} />}
              onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

// ── شعار المتجر ─────────────────────────────────────────────────────
/**
 * رافع صورة واحدة.
 *
 * ★ يُستعمل لشعار المتجر ولشعار الحساب البنكي معًا بدل نسخة ثانية:
 * الضغط ومسار الصلاحيات والرفع كلّها واحدة، ونسختان منها تتباعدان
 * عند أوّل إصلاح يُطبَّق على واحدة دون الأخرى. النصوص والمقاس
 * وزرّ الحذف معاملات لا فروع.
 */
export function StoreLogoUploader({
  storeId, currentUrl, onUploaded, onRemove,
  alt = 'شعار المتجر', addLabel = 'اختر صورة', changeLabel = 'تغيير الشعار',
  compact = false,
}: {
  storeId: string;
  currentUrl: string | null;
  onUploaded: (url: string, mediaId: string) => void;
  /** يُمرَّر ⇒ يظهر زرّ حذف الصورة. */
  onRemove?: () => void;
  alt?: string;
  addLabel?: string;
  changeLabel?: string;
  compact?: boolean;
}) {
  const { state, error, run, retry } = useUploader(storeId, 'store_logo');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = state === 'compressing' || state === 'uploading' || state === 'finalizing';

  const handle = async (file: File | undefined) => {
    if (!file) return;
    const res = await run(file);
    if (res) onUploaded(res.url, res.mediaId);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className={`relative shrink-0 overflow-hidden rounded-lg border
                         border-ink-200 bg-ink-50 ${compact ? 'size-16' : 'size-24'}`}>
          {currentUrl ? (
            /* ★ `contain` لا `cover` للشعارات: القصّ يبتر حرفًا من
               شعار بنك فيصير علامةً أخرى. */
            <Image src={currentUrl} alt={alt} fill
                   sizes={compact ? '64px' : '96px'}
                   className="bg-white object-contain p-1" />
          ) : (
            <span className="flex size-full items-center justify-center text-ink-400">
              <ImagePlus size={compact ? 20 : 26} strokeWidth={1.5} />
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" loading={busy}
                    icon={<UploadCloud size={15} />}
                    onClick={() => inputRef.current?.click()}>
              {currentUrl ? changeLabel : addLabel}
            </Button>
            {currentUrl && onRemove && !busy && (
              <button type="button" onClick={onRemove}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5
                                 text-[13px] font-semibold text-danger
                                 transition-colors hover:bg-danger-bg">
                <Trash2 size={14} aria-hidden />
                حذف
              </button>
            )}
          </div>
          <Busy state={state} />
          {!busy && <p className="text-xs text-ink-500">JPG · PNG · WebP — حتى 5 ميجابايت</p>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only"
             onChange={(e) => {
               void handle(e.target.files?.[0]);
               e.target.value = '';
             }} />

      {state === 'error' && error && (
        <ErrorLine message={error} onRetry={() => {
          void retry().then((r) => { if (r) onUploaded(r.url, r.mediaId); });
        }} />
      )}
    </div>
  );
}

// ── صور المنتج (متعددة، مرتَّبة، الأولى أساسية) ─────────────────────
export function ProductImagesUploader({ storeId, value, onChange, max = 8 }: {
  storeId: string;
  value: UploadedMedia[];
  onChange: (next: UploadedMedia[]) => void;
  max?: number;
}) {
  const { state, error, run, retry } = useUploader(storeId, 'product_image');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = state === 'compressing' || state === 'uploading' || state === 'finalizing';
  const full = value.length >= max;

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = max - value.length;
    const batch = Array.from(files).slice(0, room);
    const added: UploadedMedia[] = [];
    for (const file of batch) {
      const res = await run(file);
      if (!res) break;            // الفشل يوقف الدفعة ويُظهر زر الإعادة
      added.push(res);
    }
    if (added.length > 0) onChange([...value, ...added]);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {value.map((media, i) => (
          <figure key={media.mediaId}
                  className={cn('group relative aspect-square overflow-hidden',
                    'rounded-md border bg-ink-50',
                    i === 0 ? 'border-teal-600' : 'border-ink-200')}>
            <Image src={media.url} alt={`صورة ${i + 1}`} fill sizes="160px"
                   className="object-cover" />

            {i === 0 && (
              <figcaption className="absolute top-1 start-1 inline-flex items-center gap-1
                                     rounded-full bg-teal-600 px-1.5 py-0.5
                                     text-[10px] font-bold text-white">
                <Star size={9} /> أساسية
              </figcaption>
            )}

            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0}
                      aria-label="تقديم الصورة"
                      className="rounded bg-white/90 px-1.5 text-xs font-bold text-ink-900
                                 disabled:opacity-40">‹</button>
              <button type="button" aria-label="حذف الصورة"
                      onClick={() => onChange(value.filter((m) => m.mediaId !== media.mediaId))}
                      className="rounded bg-white/90 p-1 text-danger">
                <Trash2 size={12} />
              </button>
              <button type="button" onClick={() => move(i, i + 1)}
                      disabled={i === value.length - 1} aria-label="تأخير الصورة"
                      className="rounded bg-white/90 px-1.5 text-xs font-bold text-ink-900
                                 disabled:opacity-40">›</button>
            </div>
          </figure>
        ))}

        {!full && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                  className="flex aspect-square flex-col items-center justify-center gap-1
                             rounded-md border border-dashed border-ink-300
                             bg-white text-ink-500 hover:border-teal-400 hover:text-teal-700
                             disabled:opacity-60">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
            <span className="text-[11px] font-bold">إضافة صورة</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Busy state={state} />
        <p className="text-xs text-ink-500">
          {value.length} من {max} — الأولى هي صورة الغلاف
        </p>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only"
             onChange={(e) => {
               void addFiles(e.target.files);
               e.target.value = '';
             }} />

      {state === 'error' && error && (
        <ErrorLine message={error} onRetry={() => {
          void retry().then((r) => { if (r) onChange([...value, r]); });
        }} />
      )}
    </div>
  );
}
