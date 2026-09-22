'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Copy, Mail, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { UpgradeCard } from '@/components/ui/States';
import { formatDateTime } from '@/lib/money/format';
import {
  changeMemberRole, inviteMember, removeMember, revokeInvitation,
  type PendingInvitation, type StoreRole, type TeamMember,
} from '@/lib/team/actions';

export const ROLE_LABEL: Record<StoreRole, string> = {
  owner: 'المالك',
  manager: 'مدير',
  orders: 'موظف طلبات',
  products: 'موظف منتجات',
  customer_service: 'خدمة عملاء',
};

const ROLE_HINT: Record<Exclude<StoreRole, 'owner'>, string> = {
  manager: 'كل شيء عدا الإعدادات البنكية والاشتراك والدومين.',
  orders: 'الطلبات والدفعات وبيانات العملاء — لا يعدّل المنتجات.',
  products: 'المنتجات والتصنيفات والمخزون — يرى الطلبات ولا يغيّرها.',
  customer_service: 'يرى الطلبات والعملاء ويردّ على الدعم — بلا تعديل.',
};

const ASSIGNABLE: Exclude<StoreRole, 'owner'>[] =
  ['manager', 'orders', 'products', 'customer_service'];

/**
 * فريق المتجر.
 *
 * الدور المعروض هنا وصفٌ لما تسمح به القاعدة، لا مصدره: كل فعل يعيد
 * فحص الصلاحية في `app.has_store_permission`، وترقية أحد إلى «مدير»
 * مرفوضة في القاعدة لغير مالك المتجر حتى لو ظهر الخيار.
 */
export function TeamManager({ storeId, members, invitations, canManage, isOwner }: {
  storeId: string;
  members: TeamMember[];
  invitations: PendingInvitation[];
  canManage: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<StoreRole, 'owner'>>('orders');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const roles = isOwner ? ASSIGNABLE : ASSIGNABLE.filter((r) => r !== 'manager');

  const invite = () => start(async () => {
    setError(null);
    setLimit(null);
    setInviteUrl(null);
    const res = await inviteMember({ storeId, email, role });
    if (!res.ok) {
      if (res.code === 'LIMIT_EXCEEDED') setLimit(res.message);
      else setError({ message: res.message, field: res.field });
      return;
    }
    setInviteUrl(res.data.inviteUrl);
    setEmail('');
    router.refresh();
  });

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => {
    setError(null);
    const res = await fn();
    if (!res.ok) { setError({ message: res.message ?? 'تعذّر الإجراء' }); return; }
    router.refresh();
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* الحافظة محجوبة — المستخدم ينسخ يدويًا */ }
  };

  return (
    <div className="space-y-5">
      {limit && <UpgradeCard message={limit} />}

      {error && !error.field && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="الأعضاء" description={`${members.length} عضو.`} />
        <ul className="divide-y divide-ink-200">
          {members.map((m) => (
            <li key={m.memberId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink-900">
                  {m.fullName ?? 'عضو بلا اسم'}
                </p>
                <p className="text-xs text-ink-500">
                  {m.acceptedAt ? `انضم ${formatDateTime(m.acceptedAt)}` : 'لم يقبل بعد'}
                </p>
              </div>

              {m.role === 'owner' || !canManage ? (
                <Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>
                  {ROLE_LABEL[m.role]}
                </Badge>
              ) : (
                <select value={m.role} disabled={pending}
                        aria-label={`دور ${m.fullName ?? 'العضو'}`}
                        onChange={(e) => act(() => changeMemberRole({
                          storeId, memberId: m.memberId,
                          role: e.target.value as StoreRole,
                        }))}
                        className="h-9 rounded-[--radius-md] border border-[--color-ink-400] bg-white
                                   px-2 text-[13px] font-bold text-ink-900
                                   focus:border-teal-600">
                  {roles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                  {/* الدور الحالي يبقى ظاهرًا ولو لم يكن ضمن ما يستطيع منحه */}
                  {!roles.includes(m.role as Exclude<StoreRole, 'owner'>) && (
                    <option value={m.role}>{ROLE_LABEL[m.role]}</option>
                  )}
                </select>
              )}

              {canManage && m.role !== 'owner' && (
                <button type="button" aria-label={`إزالة ${m.fullName ?? 'العضو'}`}
                        disabled={pending}
                        onClick={() => {
                          if (confirm('إزالة هذا العضو؟ سجل ما نفّذه يبقى كما هو.'))
                            act(() => removeMember({ storeId, memberId: m.memberId }));
                        }}
                        className="rounded p-2 text-[--color-danger]
                                   hover:bg-[--color-danger-bg] disabled:opacity-50">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {invitations.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="دعوات معلّقة" />
          <ul className="divide-y divide-ink-200">
            {invitations.map((inv) => (
              <li key={inv.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <Mail size={15} className="text-ink-500" />
                <span className="min-w-0 flex-1 truncate text-ink-900" dir="ltr">
                  {inv.email}
                </span>
                <Badge tone="neutral">{ROLE_LABEL[inv.role]}</Badge>
                <span className="text-xs text-ink-500">
                  تنتهي {formatDateTime(inv.expiresAt)}
                </span>
                {canManage && (
                  <button type="button" aria-label={`إلغاء دعوة ${inv.email}`}
                          disabled={pending}
                          onClick={() => act(() => revokeInvitation({
                            storeId, invitationId: inv.id,
                          }))}
                          className="rounded p-2 text-[--color-danger]
                                     hover:bg-[--color-danger-bg] disabled:opacity-50">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inviteUrl && (
        <Card className="p-5">
          <h3 className="font-bold text-ink-900">رابط الدعوة</h3>
          <p className="mt-1 text-sm text-ink-500">
            أرسل هذا الرابط للموظف. يظهر مرة واحدة فقط — لا نحتفظ بنسخة منه.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[--radius-md] border
                             border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-900"
                  dir="ltr">{inviteUrl}</code>
            <Button variant="outline" size="sm" onClick={() => copy(inviteUrl)}
                    icon={copied ? <Check size={14} /> : <Copy size={14} />}>
              {copied ? 'نُسخ' : 'نسخ'}
            </Button>
          </div>
        </Card>
      )}

      {canManage && (
        inviting ? (
          <Card>
            <CardHeader title="دعوة موظف" />
            <div className="space-y-4 p-5">
              <Input label="البريد الإلكتروني" value={email} type="email" dir="ltr"
                     onChange={(e) => setEmail(e.target.value)}
                     error={error?.field === 'email' ? error.message : undefined} />

              <Select label="الدور" value={role}
                      onChange={(e) => setRole(e.target.value as Exclude<StoreRole, 'owner'>)}
                      hint={ROLE_HINT[role]}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>

              {!isOwner && (
                <p className="text-xs text-ink-500">
                  دور «مدير» يمنحه مالك المتجر وحده.
                </p>
              )}

              <div className="flex gap-2">
                <Button loading={pending} disabled={!email.includes('@')}
                        onClick={invite}>
                  إنشاء دعوة
                </Button>
                <Button variant="ghost" onClick={() => { setInviting(false); setError(null); }}>
                  إلغاء
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button icon={<UserPlus size={16} />} onClick={() => setInviting(true)}>
            دعوة موظف
          </Button>
        )
      )}
    </div>
  );
}
