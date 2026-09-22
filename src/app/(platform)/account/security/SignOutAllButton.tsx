'use client';
import { useState, useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { signOutAllDevices } from '../../(auth)/actions';
import { Button } from '@/components/ui/Button';

export function SignOutAllButton() {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" icon={<LogOut size={14} />}
              onClick={() => setConfirming(true)}>
        خروج من كل الأجهزة
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-sand-600">متأكد؟</span>
      <Button variant="danger" size="sm" loading={pending}
              onClick={() => start(() => { void signOutAllDevices(); })}>
        نعم، أنهِ الكل
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>إلغاء</Button>
    </div>
  );
}
