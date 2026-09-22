'use client';
import { useEffect } from 'react';

/**
 * تسجيل عامل الخدمة.
 *
 * ★ لا يُسجَّل في التطوير: نسخة مخزَّنة من صفحة قيد التعديل تضيّع وقت
 * التشخيص أكثر مما توفّر.
 *
 * ★ الفشل صامت: الموقع يعمل كاملًا بلا عامل خدمة، وهو تحسين لا شرط.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    };

    // بعد اكتمال التحميل: التسجيل أثناءه ينافس موارد الصفحة الأولى
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
