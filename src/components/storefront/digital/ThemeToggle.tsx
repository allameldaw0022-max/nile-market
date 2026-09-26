'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'nm_theme';
const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light',  label: 'نهار',  icon: Sun },
  { value: 'dark',   label: 'ليل',   icon: Moon },
  { value: 'system', label: 'النظام', icon: Monitor },
];

/**
 * تفضيل الزائر مخزَّنٌ خارج React، فيُقرأ بـ`useSyncExternalStore`.
 *
 * ★ ولماذا لا `useState` + `useEffect`: القراءة من `localStorage` لا
 * تصحّ على الخادم، وضبط الحالة داخل أثرٍ يكسر قاعدة
 * `react-hooks/set-state-in-effect`. و`useSyncExternalStore` هو
 * التعبير الصحيح عن «حالة تعيش خارج الشجرة»: لقطة على العميل،
 * ولقطة خادمية صريحة (`system`)، واشتراكٌ يتزامن بين تبويبين.
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

function snapshot(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch { /* تخزين محجوب ⇒ تفضيل النظام */ }
  return 'system';
}

/** على الخادم لا تفضيل: `prefers-color-scheme` في CSS هو الافتراضي. */
const serverSnapshot = (): ThemeChoice => 'system';

function write(next: ThemeChoice): void {
  try { localStorage.setItem(KEY, next); } catch { /* لا شيء */ }
  listeners.forEach((l) => l());
}

/**
 * اختيار الزائر بين النهار والليل وتفضيل النظام.
 *
 * ★★ لا كوكي ولا ترويسة ولا حالة خادمية — وهذا شرطٌ لا تفصيل: أيّ
 * منها كان سيُدخل تفضيل زائرٍ بعينه في الصفحة المخزَّنة المشتركة،
 * فيرى زائرٌ ثيمَ غيره، ويخرج الجواب من تخزين الـCDN.
 *
 * ★ وافتراضُه `prefers-color-scheme` في CSS ⇒ من لم يختر شيئًا يرى
 * الوضع الصحيح من أوّل رسمة بلا جافاسكربت وبلا ارتعاش. والارتعاش
 * القصير لا يمسّ إلا من اختار **خلاف** نظامه.
 *
 * ★ والسمة تُكتب على أقرب حاوية `[data-nm-digital]` لا على
 * `documentElement`: فلا يتسرّب الوضع الداكن إلى لوحة التحكّم ولا
 * إلى المتجر العادي.
 */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-nm-digital]');
    if (!root) return;
    if (choice === 'system') root.removeAttribute('data-nm-theme');
    else root.setAttribute('data-nm-theme', choice);
  }, [choice]);

  return (
    <div role="group" aria-label="وضع العرض"
         className="flex items-center gap-0.5 rounded-md border p-0.5"
         style={{ borderColor: 'var(--d-border)', background: 'var(--d-surface-2)' }}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = choice === value;
        return (
          <button key={value} type="button" onClick={() => write(value)}
                  aria-pressed={on} title={label}
                  className="grid size-8 place-items-center rounded-[5px]
                             transition-colors"
                  style={on
                    ? { background: 'var(--d-surface)', color: 'var(--d-accent)',
                        boxShadow: 'var(--d-shadow)' }
                    : { color: 'var(--d-text-3)' }}>
            <Icon size={15} aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
