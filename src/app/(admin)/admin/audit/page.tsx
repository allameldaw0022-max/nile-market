import Link from 'next/link';
import type { Metadata } from 'next';
import { FileClock } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDateTime, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'سجل التدقيق — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const ACTOR_KIND: Record<string, { label: string; tone: 'gold' | 'info' | 'neutral' }> = {
  platform: { label: 'موظف منصة', tone: 'gold' },
  store:    { label: 'فريق متجر', tone: 'info' },
  partner:  { label: 'شريك',      tone: 'info' },
  customer: { label: 'عميل',      tone: 'neutral' },
  system:   { label: 'النظام',    tone: 'neutral' },
};

/**
 * سجل التدقيق — قراءة فقط بلا استثناء.
 *
 * ★ لا زر حذف ولا تعديل هنا، ولا في أي مكان: السجل يُكتب بـtrigger
 * ويرفض التعديل على مستوى القاعدة. سجلٌّ يمكن محوه ليس سجلًّا.
 */
export default async function AdminAuditPage(
  { searchParams }: PageProps<'/admin/audit'>,
) {
  await requirePlatformAccess('audit_logs', 'view');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const action = (typeof sp.action === 'string' ? sp.action : '').trim().slice(0, 60);
  const resource = (typeof sp.resource === 'string' ? sp.resource : '').trim().slice(0, 40);

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'audit_log_page', {
    p_action: action || null,
    p_resource: resource || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return <ErrorState description="تعذّر تحميل سجل التدقيق" />;

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (resource) params.set('resource', resource);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/audit?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">سجل التدقيق</h1>
        <p className="text-sm text-ink-500 tabular">
          {formatNumber(total)} حدث — يُكتب آليًا ولا يُعدَّل ولا يُحذف.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/admin/audit">
        <input name="action" defaultValue={action} maxLength={60}
               placeholder="الإجراء — مثل partner. أو store." aria-label="تصفية بالإجراء"
               className="h-10 min-w-44 flex-1 rounded-md border
                          border-ink-400 bg-white px-3 text-[14px] text-ink-900
                          placeholder:text-ink-400 focus:border-teal-600" />
        <input name="resource" defaultValue={resource} maxLength={40}
               placeholder="نوع المورد" aria-label="تصفية بنوع المورد"
               className="h-10 min-w-36 rounded-md border
                          border-ink-400 bg-white px-3 text-[14px] text-ink-900
                          placeholder:text-ink-400 focus:border-teal-600" />
        <Button type="submit" variant="outline" size="sm">تصفية</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<FileClock size={36} strokeWidth={1.5} />}
                    title="لا أحداث مطابقة" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-200">
            {rows.map((l) => {
              const kind = ACTOR_KIND[l.actor_kind]
                ?? { label: l.actor_kind, tone: 'neutral' as const };
              return (
                <li key={l.log_id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span dir="ltr"
                          className="font-mono text-[13px] font-bold text-ink-900">
                      {l.action}
                    </span>
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                    <span className="text-xs text-ink-500">
                      {l.actor_name ?? 'غير معروف'}
                    </span>
                    <span className="ms-auto text-xs text-ink-500">
                      {formatDateTime(l.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {l.resource_type && <span dir="ltr">{l.resource_type}</span>}
                    {l.store_name && <span> · {l.store_name}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={qs({ page: page - 1 })}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={qs({ page: page + 1 })}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
