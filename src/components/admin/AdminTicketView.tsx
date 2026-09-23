'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Headset, Lock, Send, StickyNote, User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select, Textarea } from '@/components/ui/Field';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { TICKET_STATUS } from '@/lib/status';
import { TICKET_CATEGORY_LABEL } from '@/lib/support/categories';
import { formatDateTime } from '@/lib/money/format';
import type { AdminTicket } from '@/lib/supabase/rpc';
import {
  addInternalNote, assignTicket, changeTicketStatus, replyAsStaff,
} from '@/lib/admin/support';

const PRIORITIES = [
  { value: 'low', label: 'منخفض' }, { value: 'normal', label: 'عادي' },
  { value: 'high', label: 'مرتفع' }, { value: 'urgent', label: 'عاجل' },
];

/**
 * تذكرة الدعم من جانب الموظف.
 *
 * ★ الملاحظات الداخلية في بطاقة منفصلة بلون مختلف ووسم صريح: خلطها
 * بخيط الرسائل يجعل إرسالها للعميل خطأ نقرة واحدة.
 *
 * ★ الرسائل تُعرض نصًّا خامًا (`whitespace-pre-line`) بلا تفسير HTML.
 */
export function AdminTicketView({ ticket, canEdit, assignees }: {
  ticket: AdminTicket; canEdit: boolean;
  assignees: { member_id: string; display_name: string }[];
}) {
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const isClosed = ticket.status === 'closed';

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>,
               after?: () => void) => start(async () => {
    setError(null);
    const res = await fn();
    if (!res.ok) { setError(res.message ?? 'تعذّر تنفيذ الإجراء'); return; }
    after?.();
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-extrabold text-ink-900">{ticket.subject}</h1>
            <p className="text-xs text-ink-500">
              <span className="tabular" dir="ltr">{ticket.ticket_number}</span>
              {' · '}{TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category}
              {' · '}{ticket.requester_name ?? 'بلا اسم'}
              {ticket.store_name && ` · ${ticket.store_name}`}
              {' · '}فُتحت {formatDateTime(ticket.created_at)}
            </p>
            {ticket.reopened_count > 0 && (
              <p className="mt-1 text-xs text-gold-700">
                أُعيد فتحها {ticket.reopened_count} مرّة
              </p>
            )}
          </div>
          <StatusChip map={TICKET_STATUS} value={ticket.status} />
        </div>

        {canEdit && (
          <div className="mt-4 grid gap-3 border-t border-ink-200 pt-4 sm:grid-cols-3">
            <Select label="الحالة" defaultValue={ticket.status} disabled={pending}
                    onChange={(e) => run(() => changeTicketStatus({
                      ticketId: ticket.id, status: e.target.value,
                    }))}>
              {Object.entries(TICKET_STATUS).map(([value, s]) => (
                <option key={value} value={value}>{s.label}</option>
              ))}
            </Select>

            <Select label="الأولوية" defaultValue={ticket.priority} disabled={pending}
                    onChange={(e) => run(() => changeTicketStatus({
                      ticketId: ticket.id, priority: e.target.value,
                    }))}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>

            <Select label="الإسناد" defaultValue={ticket.assigned_to ?? ''}
                    disabled={pending}
                    onChange={(e) => run(() => assignTicket({
                      ticketId: ticket.id, memberId: e.target.value || null,
                    }))}>
              <option value="">بلا إسناد</option>
              {assignees.map((a) => (
                <option key={a.member_id} value={a.member_id}>{a.display_name}</option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3 text-sm
                        text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="المحادثة" description="ما يراه صاحب التذكرة." />
        <ul className="divide-y divide-ink-200">
          {ticket.messages.map((m) => (
            <li key={m.id} className="flex gap-3 px-5 py-4">
              <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center
                                rounded-full ${m.author_kind === 'staff'
                                  ? 'bg-teal-100 text-teal-700'
                                  : 'bg-ink-100 text-ink-600'}`}>
                {m.author_kind === 'staff' ? <Headset size={14} /> : <User size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-500">
                  {m.author_kind === 'staff' ? 'فريق الدعم'
                    : m.author_kind === 'system' ? 'النظام'
                    : (m.author_name ?? 'صاحب التذكرة')}
                  {' · '}{formatDateTime(m.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-900">{m.body}</p>
              </div>
            </li>
          ))}
        </ul>

        {canEdit && !isClosed && (
          <div className="space-y-2 border-t border-ink-200 p-4">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)}
                      aria-label="ردّ يصل صاحب التذكرة"
                      placeholder="ردّ يصل صاحب التذكرة…" />
            <Button size="sm" icon={<Send size={14} />} loading={pending}
                    disabled={reply.trim().length === 0}
                    onClick={() => run(
                      () => replyAsStaff({ ticketId: ticket.id, body: reply }),
                      () => setReply(''))}>
              إرسال الرد
            </Button>
          </div>
        )}

        {isClosed && (
          <p className="border-t border-ink-200 px-5 py-4 text-sm text-ink-500">
            التذكرة مغلقة — لا رد عليها. يفتح صاحبها تذكرة جديدة عند الحاجة.
          </p>
        )}
      </Card>

      <Card className="overflow-hidden border-gold-500/30">
        <CardHeader
          title="ملاحظات داخلية"
          description="لا تصل صاحب التذكرة إطلاقًا — جدول منفصل بصلاحية الدعم وحدها."
          action={<Badge tone="gold" icon={<Lock size={11} />}>داخلي</Badge>}
        />
        {ticket.notes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">لا ملاحظات.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {ticket.notes.map((n) => (
              <li key={n.id} className="flex gap-3 bg-gold-300/5 px-5 py-3.5">
                <StickyNote size={15} className="mt-0.5 shrink-0 text-gold-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-500">
                    {n.author_name ?? 'موظف'} · {formatDateTime(n.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-900">
                    {n.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="space-y-2 border-t border-ink-200 p-4">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                      aria-label="ملاحظة داخلية"
                      placeholder="ملاحظة للفريق — لا يراها العميل…" />
            <Button size="sm" variant="outline" loading={pending}
                    disabled={note.trim().length === 0}
                    onClick={() => run(
                      () => addInternalNote({ ticketId: ticket.id, body: note }),
                      () => setNote(''))}>
              إضافة ملاحظة
            </Button>
          </div>
        )}
      </Card>

      {ticket.events.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="سجل التذكرة" />
          <ul className="divide-y divide-ink-200">
            {ticket.events.map((e, i) => (
              <li key={`${e.event}-${e.created_at}-${i}`}
                  className="flex flex-wrap items-center gap-x-3 px-5 py-2.5 text-xs">
                <span dir="ltr" className="font-mono font-bold text-ink-900">
                  {e.event}
                </span>
                {e.to_value && (
                  <span className="text-ink-500">
                    {e.from_value ?? '—'} ← {e.to_value}
                  </span>
                )}
                <span className="ms-auto text-ink-500">
                  {e.actor_name ?? 'النظام'} · {formatDateTime(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
