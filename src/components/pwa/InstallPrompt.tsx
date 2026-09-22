'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'nm.install.dismissed';

/**
 * دعوة التثبيت.
 *
 * ★ لا تظهر إلا بعد أن يطلقها المتصفح (`beforeinstallprompt`): إظهار
 * زرّ تثبيت لا يعمل أسوأ من عدم إظهاره.
 *
 * ★ الرفض يُحفظ محليًا: إلحاح الدعوة في كل زيارة يدفع لإغلاق الموقع.
 */
export function InstallPrompt({ label }: { label: string }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      // وضع التصفّح الخاص يمنع التخزين — نتعامل كأنه لم يُرفض
    }
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden || !event) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* تجاهل */ }
  };

  return (
    <div role="region" aria-label="تثبيت التطبيق"
         className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3
                    rounded-[--radius-lg] border border-ink-200 bg-white p-3
                    shadow-[--shadow-popover] sm:mx-auto sm:max-w-sm">
      <Download size={20} className="shrink-0 text-teal-700" />
      <p className="flex-1 text-sm font-bold text-ink-900">{label}</p>
      <button type="button"
              onClick={() => {
                void event.prompt();
                void event.userChoice.finally(dismiss);
              }}
              className="rounded-[--radius-md] bg-teal-600 px-3 py-1.5 text-sm
                         font-bold text-white hover:bg-teal-700">
        تثبيت
      </button>
      <button type="button" onClick={dismiss} aria-label="إخفاء"
              className="text-ink-400 hover:text-ink-500">
        <X size={18} />
      </button>
    </div>
  );
}
