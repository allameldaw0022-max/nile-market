'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { measureNow } from './actions';

export function MeasureNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-end">
      <Button variant="outline" size="sm" loading={pending}
              icon={<RefreshCw size={14} />}
              onClick={() => start(async () => {
                setError(null);
                try {
                  const res = await measureNow();
                  if (!res.ok) { setError(res.message); return; }
                  router.refresh();
                } catch {
                  setError('تعذّر الاتصال بالخادم');
                }
              })}>
        قِس الآن
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
