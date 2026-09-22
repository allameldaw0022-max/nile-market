'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Headset, Send, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { StatusChip } from '@/components/ui/Badge';
import { TICKET_STATUS } from '@/lib/status';
import { formatDateTime } from '@/lib/money/format';
import { closeTicket, replyToTicket, type TicketDetail } from '@/lib/support/actions';
import { TICKET_CATEGORY_LABEL } from '@/lib/support/categories';

/**
 * خيط التذكرة.
 *
 * الرسائل تُعرض كما وردت نصًا خامًا (`whitespace-pre-line`) بلا أي
 * تفسير HTML: نص يكتبه طرف آخر لا يُصيَّر كترميز.
 */
export function TicketThread({ ticket }: { ticket: TicketDetail }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const isClosed = ticket.status === 'closed';

  const send = () => start(async () => {
    setError(null);
    const res = await replyToTicket({ ticketId: ticket.id, body });
    if (!res.ok) { setError(res.message); return; }
    setBody('');
    router.refresh();
  });

  const close = () => start(async () => {
    setError(null);
    const res = await closeTicket(ticket.id);
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-extrabold text-ink-900">{ticket.subject}</h1>
            <p className="text-xs text-ink-500">
              <span className="tabular" dir="ltr">{ticket.ticketNumber}</span>
              {' · '}{TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category}
              {' · '}فُتحت {formatDateTime(ticket.createdAt)}
            </p>
          </div>
          <StatusChip map={TICKET_STATUS} value={ticket.status} />
        </div>
      </Card>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      <ol className="space-y-3">
        {ticket.messages.map((m) => {
          const isSystem = m.authorKind === 'system';
          const isStaff = m.authorKind === 'staff';

          if (isSystem) {
            return (
              <li key={m.id} className="text-center text-xs text-ink-500">
                {m.body} · {formatDateTime(m.createdAt)}
              </li>
            );
          }

          return (
            <li key={m.id}
                className={`flex gap-2.5 ${m.isMine ? 'flex-row-reverse' : ''}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full
                                ${isStaff ? 'bg-teal-600 text-white'
                                  : 'bg-ink-200 text-ink-700'}`}>
                {isStaff ? <Headset size={15} /> : <User size={15} />}
              </span>
              <div className={`max-w-[85%] rounded-[--radius-lg] border p-3.5
                               ${m.isMine
                                 ? 'border-teal-200 bg-[--color-teal-50]'
                                 : 'border-ink-200 bg-white'}`}>
                <p className="text-xs font-bold text-ink-500">
                  {isStaff ? 'فريق الدعم' : m.isMine ? 'أنت' : 'صاحب التذكرة'}
                  {' · '}{formatDateTime(m.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed
                              text-ink-900">
                  {m.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {isClosed ? (
        <Card className="p-5 text-center">
          <CheckCircle2 className="mx-auto text-[--color-success]" size={28} />
          <p className="mt-2 text-sm text-ink-500">
            هذه التذكرة مغلقة. إن عادت المشكلة، افتح تذكرة جديدة.
          </p>
        </Card>
      ) : (
        <Card className="p-5">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)}
                    aria-label="ردك" className="min-h-28"
                    placeholder="اكتب ردك هنا…" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button loading={pending} disabled={body.trim().length === 0}
                    icon={<Send size={15} />} onClick={send}>
              إرسال
            </Button>
            {ticket.isRequester && (
              <Button variant="ghost" loading={pending} onClick={close}>
                إغلاق التذكرة
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
