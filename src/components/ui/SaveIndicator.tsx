'use client';
import { AlertTriangle, Check, Loader2, WifiOff } from 'lucide-react';
import type { SaveState } from '@/lib/use-autosave';

export function SaveIndicator({ state, error }: { state: SaveState; error?: string | null }) {
  if (state === 'idle') return null;
  const map = {
    saving:  { icon: <Loader2 size={13} className="animate-spin" />, text: 'يحفظ…',        cls: 'text-sand-600' },
    saved:   { icon: <Check size={13} />,                           text: 'تم الحفظ',      cls: 'text-[--color-success]' },
    offline: { icon: <WifiOff size={13} />,                         text: 'بلا اتصال — سيُحفظ تلقائيًا', cls: 'text-gold-700' },
    error:   { icon: <AlertTriangle size={13} />,                   text: error ?? 'تعذّر الحفظ — نعيد المحاولة', cls: 'text-[--color-danger]' },
  } as const;
  const v = map[state];
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 text-xs font-bold ${v.cls}`}>
      {v.icon}{v.text}
    </span>
  );
}
