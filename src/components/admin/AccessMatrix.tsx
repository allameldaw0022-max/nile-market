'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, KeyRound, Search, ShieldCheck, ShieldOff, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { formatDateTime } from '@/lib/money/format';
import {
  ADMIN_SECTIONS, ADMIN_SECTION_LABELS, type AdminSection,
} from '@/lib/authz/permissions';
import {
  findAccount, saveAdminMember, suspendAdminMember,
} from '@/lib/admin/people';

export type MatrixMember = {
  memberId: string; profileId: string; displayName: string;
  isOwner: boolean; status: string; mfaRequired: boolean;
  lastActiveAt: string | null;
  permissions: Record<string, string>;
  isMe: boolean;
};

const LEVELS = [
  { value: 'none', label: '—' },
  { value: 'view', label: 'اطّلاع' },
  { value: 'edit', label: 'تعديل' },
  { value: 'approve', label: 'اعتماد' },
  { value: 'manage', label: 'إدارة كاملة' },
];

const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  LEVELS.map((l) => [l.value, l.label]),
);

/**
 * مصفوفة الوصول + محرّر صلاحيات الموظف.
 *
 * ★ لا يقرّر هذا المكوّن شيئًا: كل إجراء ينادي فعلًا خادميًا تعيد
 * القاعدة فحصه. حتى الرسالة التي تظهر عند الرفض هي رسالة القاعدة —
 * مثل «لا يقلّ عن حسابَي إدارة نشطَين».
 */
export function AccessMatrix({ members, canManage }: {
  members: MatrixMember[]; canManage: boolean;
}) {
  const [editing, setEditing] = useState<MatrixMember | null>(null);
  const [adding, setAdding] = useState(false);

  if (editing || adding) {
    return (
      <MemberEditor
        member={editing}
        onDone={() => { setEditing(null); setAdding(false); }}
      />
    );
  }

  return (
    <div>
      {canManage && (
        <div className="border-b border-ink-200 px-4 py-3">
          <Button size="sm" icon={<UserPlus size={15} />}
                  onClick={() => setAdding(true)}>
            إضافة موظف
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-start">
              <th className="px-4 py-2.5 text-start font-bold text-ink-700">الموظف</th>
              <th className="px-4 py-2.5 text-start font-bold text-ink-700">الحالة</th>
              <th className="px-4 py-2.5 text-start font-bold text-ink-700">الصلاحيات</th>
              <th className="px-4 py-2.5 text-start font-bold text-ink-700">آخر نشاط</th>
              {canManage && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {members.map((m) => (
              <MemberRow key={m.memberId} member={m} canManage={canManage}
                         onEdit={() => setEditing(m)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRow({ member, canManage, onEdit }: {
  member: MatrixMember; canManage: boolean; onEdit: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sections = Object.entries(member.permissions);

  const suspend = () => start(async () => {
    setError(null);
    const res = await suspendAdminMember(member.memberId);
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-bold text-ink-900">
          {member.displayName}
          {member.isMe && <span className="text-xs text-ink-500"> (أنت)</span>}
        </p>
        {member.isOwner && <Badge tone="gold" className="mt-1">مالك المنصة</Badge>}
        {error && (
          <p role="alert" className="mt-1 flex items-start gap-1 text-xs
                          text-[--color-danger]">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
      </td>

      <td className="px-4 py-3">
        <Badge tone={member.status === 'active' ? 'success' : 'neutral'}>
          {member.status === 'active' ? 'نشط' : 'موقوف'}
        </Badge>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-500">
          {member.mfaRequired
            ? <><ShieldCheck size={11} />تحقق بخطوتين إلزامي</>
            : <><ShieldOff size={11} className="text-[--color-danger]" />بلا تحقق</>}
        </p>
      </td>

      <td className="px-4 py-3">
        {member.isOwner ? (
          <span className="text-xs text-ink-500">كل الأقسام</span>
        ) : sections.length === 0 ? (
          <span className="text-xs text-ink-500">لا صلاحيات</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {sections.map(([section, level]) => (
              <span key={section}
                    className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px]
                               font-bold text-ink-700">
                {ADMIN_SECTION_LABELS[section as AdminSection] ?? section}
                <span className="text-ink-500"> · {LEVEL_LABEL[level] ?? level}</span>
              </span>
            ))}
          </div>
        )}
      </td>

      <td className="px-4 py-3 text-xs text-ink-500">
        {formatDateTime(member.lastActiveAt)}
      </td>

      {canManage && (
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={member.isMe}
                    onClick={onEdit}>
              الصلاحيات
            </Button>
            {member.status === 'active' && (
              <Button size="sm" variant="danger" loading={pending}
                      disabled={member.isMe} onClick={suspend}>
                إيقاف
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function MemberEditor({ member, onDone }: {
  member: MatrixMember | null; onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(member?.displayName ?? '');
  const [profileId, setProfileId] = useState(member?.profileId ?? '');
  const [perms, setPerms] = useState<Record<string, string>>(
    member?.permissions ?? {});
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<
    { profileId: string; name: string | null; email: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const search = () => start(async () => {
    setError(null);
    const res = await findAccount(term);
    if (!res.ok) { setError(res.message); return; }
    setFound(res.data);
  });

  const save = () => start(async () => {
    setError(null);
    const res = await saveAdminMember({
      profileId, displayName: name, isOwner: member?.isOwner ?? false,
      permissions: perms,
    });
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
    onDone();
  });

  return (
    <div className="space-y-5 p-5">
      <div>
        <h3 className="font-bold text-ink-900">
          {member ? `صلاحيات ${member.displayName}` : 'موظف جديد'}
        </h3>
        <p className="mt-0.5 text-sm text-ink-500">
          الصلاحيات تُستبدل بالكامل عند الحفظ — ما لا تختاره هنا يُرفع،
          فلا تبقى صلاحية قديمة منسيّة. والتحقق بخطوتين يُفرض على كل
          حساب إدارة جديد (D28).
        </p>
      </div>

      {!member && (
        <div className="space-y-3 rounded-[--radius-md] border border-ink-200 p-4">
          <p className="text-[13px] font-bold text-ink-700">
            اختر حسابًا مسجَّلًا لترقيته
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input value={term} onChange={(e) => setTerm(e.target.value)}
                     label="بحث بالبريد أو الاسم" placeholder="example@mail.com" />
            </div>
            <Button variant="outline" icon={<Search size={15} />}
                    loading={pending} onClick={search}>بحث</Button>
          </div>

          {found.length > 0 && (
            <ul className="divide-y divide-ink-200 rounded-[--radius-md]
                           border border-ink-200">
              {found.map((u) => (
                <li key={u.profileId}>
                  <button type="button"
                          onClick={() => {
                            setProfileId(u.profileId);
                            setName(u.name ?? u.email ?? '');
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2.5
                                      text-start text-sm hover:bg-ink-50
                                      ${profileId === u.profileId ? 'bg-teal-50' : ''}`}>
                    {profileId === u.profileId && (
                      <Check size={14} className="text-teal-700" />
                    )}
                    <span className="flex-1">
                      <span className="block font-bold text-ink-900">
                        {u.name ?? 'بلا اسم'}
                      </span>
                      <span className="block text-xs text-ink-500" dir="ltr">
                        {u.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Input label="الاسم الظاهر" value={name} required
             onChange={(e) => setName(e.target.value)} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => (
          <Select key={section} label={ADMIN_SECTION_LABELS[section]}
                  value={perms[section] ?? 'none'}
                  onChange={(e) => setPerms((p) => ({
                    ...p, [section]: e.target.value,
                  }))}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
        ))}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-[--radius-md]
                        border border-[--color-danger]/30 bg-[--color-danger-bg]
                        p-3 text-sm text-[--color-danger]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      <div className="flex gap-2">
        <Button loading={pending} icon={<KeyRound size={15} />}
                disabled={!profileId || name.trim().length < 2}
                onClick={save}>
          حفظ الصلاحيات
        </Button>
        <Button variant="ghost" onClick={onDone}>تراجع</Button>
      </div>
    </div>
  );
}
