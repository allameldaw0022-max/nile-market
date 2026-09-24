'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { becomePartner } from '@/lib/partners/actions';

/**
 * تأكيد الانضمام لحساب قائم.
 *
 * ★ فعل صريح لا تحويل صامت: من وصل إلى بوابة الشراكة بطريق آخر
 * (تاجر نقر رابطًا مثلًا) لا يصير شريكًا بمجرد فتح الصفحة.
 * الإنشاء نفسه خادمي بهوية صاحب الجلسة — لا يُمرَّر معرّف حساب.
 */
export function JoinConfirm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const join = () => start(async () => {
    setError(null);
    const res = await becomePartner();
    if (!res.ok) { setError(res.message); return; }
    router.push('/partner');
  });

  return (
    <div className="mt-6 space-y-3">
      <Button className="w-full" size="lg" loading={pending}
              icon={<Handshake size={16} />} onClick={join}>
        أنشئ ملف الشريك
      </Button>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
