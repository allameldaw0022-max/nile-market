'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/money/format';
import {
  listNotifications, markNotificationsRead, type NotificationRow,
} from '@/lib/notifications/actions';

/**
 * جرس التنبيهات.
 *
 * القائمة تُحمَّل عند الفتح لا مع كل صفحة: صندوق التنبيهات ليس جزءًا
 * من المحتوى الذي يراه الزائر، وتحميله دائمًا يضيف استعلامًا لكل
 * زيارة بلا سبب.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      start(async () => {
        const res = await listNotifications(20);
        if (res.ok) {
          setItems(res.data.items);
          setUnread(res.data.unread);
        } else {
          setItems([]);
        }
      });
    }
  };

  const markAll = () => start(async () => {
    const res = await markNotificationsRead();
    if (!res.ok) return;
    setUnread(0);
    setItems((prev) => prev?.map((n) => ({
      ...n, readAt: n.readAt ?? new Date().toISOString(),
    })) ?? null);
    router.refresh();
  });

  return (
    <div className="relative">
      <button type="button" onClick={toggle} aria-expanded={open}
              aria-label={unread > 0 ? `التنبيهات (${unread} غير مقروء)` : 'التنبيهات'}
              className="relative grid size-10 place-items-center rounded-md
                         text-ink-700 hover:bg-ink-100">
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center
                           rounded-full bg-danger px-1 text-[11px]
                           font-extrabold text-white tabular">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="إغلاق التنبيهات"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-40 mt-1 w-80 overflow-hidden
                          rounded-lg border border-ink-200 bg-white
                          shadow-popover">
            <div className="flex items-center justify-between gap-2 border-b
                            border-ink-200 px-4 py-2.5">
              <span className="text-sm font-bold text-ink-900">التنبيهات</span>
              {unread > 0 && (
                <button type="button" onClick={markAll} disabled={pending}
                        className="inline-flex items-center gap-1 text-xs font-bold
                                   text-teal-700 hover:underline disabled:opacity-50">
                  <CheckCheck size={13} /> تعليم الكل كمقروء
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {items === null ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8
                              text-sm text-ink-500">
                  <Loader2 size={14} className="animate-spin" /> يحمّل…
                </p>
              ) : items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-500">
                  لا تنبيهات بعد.
                </p>
              ) : (
                <ul className="divide-y divide-ink-200">
                  {items.map((n) => {
                    const content = (
                      <>
                        <p className="text-sm font-bold text-ink-900">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-ink-500">
                          {formatDateTime(n.createdAt)}
                        </p>
                      </>
                    );
                    const cls = `block px-4 py-3 hover:bg-ink-50 ${
                      n.readAt ? '' : 'border-e-2 border-e-teal-600 bg-teal-50'}`;

                    return (
                      <li key={n.id}>
                        {n.link ? (
                          <Link href={n.link} className={cls}
                                onClick={() => setOpen(false)}>
                            {content}
                          </Link>
                        ) : (
                          <div className={cls}>{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
