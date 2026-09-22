'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { createTicket } from '@/lib/support/actions';
import { TICKET_CATEGORIES } from '@/lib/support/categories';

export function NewTicketForm({ stores }: {
  stores: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    const res = await createTicket({
      subject: String(formData.get('subject') ?? ''),
      category: String(formData.get('category') ?? 'other'),
      body: String(formData.get('body') ?? ''),
      storeId: String(formData.get('store_id') ?? '') || null,
    });
    if (!res.ok) { setError({ message: res.message, field: res.field }); return; }
    router.push(`/support/${res.data.ticketId}`);
  });

  return (
    <Card>
      <form action={submit} className="space-y-4 p-5">
        {error && !error.field && (
          <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                          border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                          text-sm text-[--color-danger]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
          </div>
        )}

        <Input name="subject" label="عنوان المشكلة" required maxLength={200}
               placeholder="مثال: لا تصلني تنبيهات الطلبات"
               error={error?.field === 'subject' ? error.message : undefined} />

        <Select name="category" label="التصنيف" required defaultValue="other"
                error={error?.field === 'category' ? error.message : undefined}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>

        {stores.length > 0 && (
          <Select name="store_id" label="المتجر المتعلّق (اختياري)" defaultValue="">
            <option value="">بلا متجر</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}

        <Textarea name="body" label="تفاصيل المشكلة" required
                  className="min-h-40"
                  hint="متى بدأت المشكلة؟ وما الخطوات التي تؤدي إليها؟"
                  error={error?.field === 'body' ? error.message : undefined} />

        <Button type="submit" size="lg" loading={pending} icon={<Send size={16} />}>
          إرسال التذكرة
        </Button>
      </form>
    </Card>
  );
}
