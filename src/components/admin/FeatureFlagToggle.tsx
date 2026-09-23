'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { setFeatureFlag } from '@/lib/admin/actions';

export function FeatureFlagToggle({ flagKey, enabled }: {
  flagKey: string; enabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => start(async () => {
    setError(null);
    const res = await setFeatureFlag({ key: flagKey, enabled: !enabled });
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Badge tone={enabled ? 'success' : 'neutral'}>
          {enabled ? 'مفعّلة' : 'متوقفة'}
        </Badge>
        <Button size="sm" variant={enabled ? 'danger' : 'outline'} loading={pending}
                onClick={toggle}>
          {enabled ? 'إيقاف' : 'تفعيل'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-1 text-xs text-danger">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
