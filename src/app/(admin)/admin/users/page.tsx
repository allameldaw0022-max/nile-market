import Link from 'next/link';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { AccountStatusActions } from '@/components/admin/AccountStatusActions';
import { formatDate, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'المستخدمون — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  active:    { label: 'نشط',   tone: 'success' },
  suspended: { label: 'موقوف', tone: 'danger' },
  closed:    { label: 'مغلق',  tone: 'neutral' },
};

/**
 * حسابات المنصة.
 *
 * ★ البريد يأتي من `platform_users()` وحدها — `auth.users` لا تصله
 * PostgREST، والدالة تفحص `users:view` قبل أن تُرجع حرفًا.
 */
export default async function AdminUsersPage(
  { searchParams }: PageProps<'/admin/users'>,
) {
  await requirePlatformAccess('users', 'view');
  const actor = await getActor();
  const canManage = actor.kind === 'user' && adminHasLevel(actor, 'users', 'manage');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const term = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60);
  const status = typeof sp.status === 'string' ? sp.status : '';

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'platform_users', {
    p_search: term || null,
    p_status: STATUS[status] ? status : null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return <ErrorState description="تعذّر تحميل المستخدمين" />;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/users?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">المستخدمون</h1>
        <p className="text-sm text-ink-500 tabular">
          {formatNumber(Number(total))} حساب
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/admin/users">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="البريد أو الاسم أو الهاتف" aria-label="بحث في الحسابات"
               className="h-10 min-w-52 flex-1 rounded-[--radius-md] border
                          border-[--color-ink-400] bg-white px-3 text-[14px] text-ink-900
                          placeholder:text-ink-400 focus:border-teal-600" />
        <input type="hidden" name="status" value={status} />
        <Button type="submit" variant="outline" size="sm">بحث</Button>
      </form>

      <nav className="flex gap-1.5" aria-label="تصفية الحالة">
        <Link href={qs({ status: null, page: null })} className={chip(!status)}>الكل</Link>
        {Object.entries(STATUS).map(([value, s]) => (
          <Link key={value} href={qs({ status: value, page: null })}
                className={chip(status === value)}>{s.label}</Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={<Users size={36} strokeWidth={1.5} />}
                    title="لا حسابات مطابقة" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-200">
            {rows.map((u) => {
              const s = STATUS[u.account_status]
                ?? { label: u.account_status, tone: 'neutral' as const };
              return (
                <li key={u.profile_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink-900">
                      {u.full_name ?? 'بلا اسم'}
                      {u.is_staff && (
                        <Badge tone="gold" className="ms-2">موظف منصة</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-500" dir="ltr">
                      {u.email ?? '—'}{u.phone ? ` · ${u.phone}` : ''}
                    </p>
                  </div>

                  <span className="text-xs text-ink-500">
                    {formatNumber(Number(u.stores_count))} متجر
                  </span>
                  <span className="text-xs text-ink-500">
                    انضم {formatDate(u.created_at)}
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>

                  {canManage && !u.is_staff && (
                    <AccountStatusActions profileId={u.profile_id}
                                          status={u.account_status} />
                  )}
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

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${active
    ? 'border-teal-600 bg-teal-600 text-white'
    : 'border-ink-300 bg-white text-ink-600 hover:border-teal-400'}`;
