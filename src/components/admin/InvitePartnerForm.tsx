'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, Link2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { invitePartner } from '@/lib/admin/people';

/**
 * دعوة شريك جديد.
 *
 * ★ رابط الدعوة يظهر مرّة واحدة فقط: القاعدة تخزّن بصمته لا نصّه، فلا
 * سبيل لاستعادته لاحقًا — ولا سبيل لأحد يقرأ الجدول أن يستخدمه.
 */
export function InvitePartnerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [invite, setInvite] = useState<{ link: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => start(async () => {
    setError(null);
    const res = await invitePartner({ name, email, phone: phone || undefined });
    if (!res.ok) { setError(res.message); return; }
    setInvite({ link: res.data.link, code: res.data.referralCode });
    setName(''); setEmail(''); setPhone('');
    router.refresh();
  });

  if (invite) {
    const url = typeof window === 'undefined'
      ? invite.link : `${window.location.origin}${invite.link}`;
    return (
      <Card className="border-gold-500/40 bg-gold-300/10 p-5">
        <h2 className="flex items-center gap-2 font-bold text-ink-900">
          <Link2 size={17} className="text-gold-700" />
          رابط الدعوة — يظهر مرّة واحدة
        </h2>
        <p className="mt-1 text-sm text-ink-700">
          انسخه الآن وسلّمه للشريك. لا نحتفظ بنسخة منه، وإن ضاع تُعاد
          الدعوة من جديد. رمز الإحالة: <strong dir="ltr">{invite.code}</strong>
        </p>
        <p dir="ltr" className="mt-3 overflow-x-auto rounded-[--radius-md] bg-white
                                p-2.5 text-xs text-ink-900">{url}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" icon={<Copy size={14} />}
                  onClick={() => {
                    navigator.clipboard.writeText(url).then(() => setCopied(true),
                      () => setCopied(false));
                  }}>
            {copied ? 'نُسخ' : 'نسخ الرابط'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setInvite(null)}>
            تم
          </Button>
        </div>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" icon={<UserPlus size={15} />}
              onClick={() => setOpen(true)}>
        دعوة شريك
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader title="دعوة شريك"
                  description="النسبة تُؤخذ من إعدادات المنصة، وتُعدَّل لاحقًا بصلاحية العمولات." />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="الاسم" value={name} required
                 onChange={(e) => setName(e.target.value)} />
          <Input label="البريد" type="email" dir="ltr" value={email} required
                 onChange={(e) => setEmail(e.target.value)} />
          <Input label="الهاتف (اختياري)" dir="ltr" value={phone}
                 onChange={(e) => setPhone(e.target.value)} />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-[--color-danger]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
          </p>
        )}

        <div className="flex gap-2">
          <Button loading={pending} onClick={submit}
                  disabled={name.trim().length < 2 || !email.includes('@')}>
            إنشاء الدعوة
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>تراجع</Button>
        </div>
      </div>
    </Card>
  );
}
