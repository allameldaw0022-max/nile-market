'use client';
import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { storefrontSignOut } from '@/lib/auth/storefront';
import { Button } from '@/components/ui/Button';

/** خروج العميل من هذا المتجر — الجلسة على هذا المضيف وحده فتنتهي معه. */
export function StoreSignOut() {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" loading={pending}
            icon={<LogOut size={15} aria-hidden />}
            onClick={() => start(async () => { await storefrontSignOut(); })}>
      خروج
    </Button>
  );
}
