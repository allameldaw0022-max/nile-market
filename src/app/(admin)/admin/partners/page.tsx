import Link from 'next/link';
import type { Metadata } from 'next';
import { Handshake } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PartnerRow } from '@/components/admin/PartnerRow';
import { InvitePartnerForm } from '@/components/admin/InvitePartnerForm';
import { formatMoney, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'الشركاء — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  invited:   { label: 'مدعو',  tone: 'warning' },
  active:    { label: 'نشط',   tone: 'success' },
  suspended: { label: 'موقوف', tone: 'danger' },
};

/**
 * الشركاء المُحيلون.
 *
 * ★ نسبة العمولة تظهر هنا لكن تعديلها يحتاج `commissions:manage`،
 * والقاعدة (حارس 0010) هي من ترفض غيره — لا هذه الصفحة.
 */
export default async function AdminPartnersPage(
  { searchParams }: PageProps<'/admin/partners'>,
) {
  await requirePlatformAccess('partners', 'view');
  const actor = await getActor();
  const canEdit = actor.kind === 'user' && adminHasLevel(actor, 'partners', 'edit');
  const canRate = actor.kind === 'user' && adminHasLevel(actor, 'commissions', 'manage');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const term = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60);
  const status = typeof sp.status === 'string' ? sp.status : '';

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'partner_admin_list', {
    p_status: STATUS[status] ? status : null,
    p_search: term || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return <ErrorState description="تعذّر تحميل الشركاء" />;

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const payable = rows.reduce((sum, r) => sum + Number(r.payable ?? 0), 0);

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/partners?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الشركاء</h1>
        <p className="text-sm text-ink-500 tabular">
          {formatNumber(total)} شريك · مستحق في هذه الصفحة {formatMoney(payable)}
        </p>
      </div>

      {canEdit && <InvitePartnerForm />}

      <form className="flex flex-wrap items-center gap-2" action="/admin/partners">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="الاسم أو البريد أو رمز الإحالة" aria-label="بحث في الشركاء"
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
        <EmptyState icon={<Handshake size={36} strokeWidth={1.5} />}
                    title="لا شركاء مطابقون" />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title="قائمة الشركاء"
                      description="الإحالات والعمولات تبقى محفوظة حتى بعد إيقاف الشراكة." />
          <ul className="divide-y divide-ink-200">
            {rows.map((p) => (
              <li key={p.partner_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink-900">{p.name}</p>
                  <p className="truncate text-xs text-ink-500" dir="ltr">
                    {p.email} · {p.referral_code}
                  </p>
                  {!p.is_linked && p.status === 'invited' && (
                    <p className="text-xs text-gold-700">
                      لم يقبل الدعوة بعد — رابط الدعوة يُسلَّم مرّة واحدة
                    </p>
                  )}
                </div>

                <span className="text-xs text-ink-500">
                  {formatNumber(Number(p.referrals_count))} إحالة ·{' '}
                  {formatNumber(Number(p.stores_active))} نشط
                </span>
                <span className="font-bold tabular text-ink-900">
                  {formatMoney(p.payable)}
                </span>
                <Badge tone={STATUS[p.status]?.tone ?? 'warning'}>
                  {STATUS[p.status]?.label ?? p.status}
                </Badge>

                <PartnerRow partnerId={p.partner_id} status={p.status}
                            rate={Number(p.commission_rate)}
                            canEdit={canEdit} canRate={canRate} />
              </li>
            ))}
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
