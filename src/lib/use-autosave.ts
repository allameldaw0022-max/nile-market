'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

/**
 * حفظ تلقائي مع إعادة محاولة أسّية ومسودة محلية.
 *
 * يحقق متطلبات المواصفات §7 و§27:
 *  - حفظ كل 2.5 ثانية بعد آخر تعديل (debounce)
 *  - مسودة في localStorage تُستعاد بعد إعادة التحميل أو انقطاع الشبكة
 *  - إعادة محاولة 1s → 2s → 4s → 8s عند فشل الشبكة
 *  - تحذير قبل الخروج إن بقي تغيير غير محفوظ
 */
export function useAutosave<T extends Record<string, unknown>>({
  draftKey, values, save, delay = 2500,
}: {
  draftKey: string;
  values: T;
  save: (values: T) => Promise<{ ok: boolean; message?: string }>;
  delay?: number;
}) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const dirty = useRef(false);
  const latest = useRef(values);

  // القيم والمسودة تُحدَّثان بعد الالتزام لا أثناء التصيير.
  // المسودة محلية: تُكتب فورًا ولا تنتظر الشبكة ⇒ لا تُفقد البيانات.
  useEffect(() => {
    latest.current = values;
    try { localStorage.setItem(draftKey, JSON.stringify(values)); } catch { /* ممتلئ أو محجوب */ }
  }, [draftKey, values]);

  // مرجع لأحدث نسخة من flush: التراجع الأسّي يستدعي نفسه، والاستدعاء
  // الذاتي داخل useCallback يقرأ الدالة قبل إسنادها.
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
      return;
    }
    setState('saving');
    const res = await save(latest.current);
    if (res.ok) {
      dirty.current = false;
      attempt.current = 0;
      setError(null);
      setState('saved');
      try { localStorage.removeItem(draftKey); } catch { /* تجاهل */ }
      return;
    }
    setError(res.message ?? 'تعذّر الحفظ');
    setState('error');
    // تراجع أسّي بسقف 4 محاولات
    if (attempt.current < 4) {
      const backoff = 1000 * 2 ** attempt.current;
      attempt.current += 1;
      timer.current = setTimeout(() => { void flushRef.current(); }, backoff);
    }
  }, [save, draftKey]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, delay);
  }, [flush, delay]);

  // إعادة المحاولة فور عودة الشبكة
  useEffect(() => {
    const onOnline = () => { if (dirty.current) void flush(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  // تحذير قبل مغادرة الصفحة وهناك تغيير غير محفوظ
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { state, error, markDirty, saveNow: flush };
}

/** استعادة مسودة محلية إن وُجدت. */
export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
