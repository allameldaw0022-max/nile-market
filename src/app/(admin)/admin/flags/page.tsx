import type { Metadata } from 'next';
import { Flag } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { FeatureFlagToggle } from '@/components/admin/FeatureFlagToggle';
import { formatDateTime } from '@/lib/money/format';

export const metadata: Metadata = {
  title: 'الميزات — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * مفاتيح الميزات.
 *
 * ★ المفتاح يُقرأ في القاعدة عبر `app.feature_enabled` قبل تنفيذ أي
 * مسار يحرسه — إطفاؤه يوقف الميزة فعلًا لا يخفي زرّها فقط.
 */
export default async function AdminFlagsPage() {
  await requirePlatformAccess('feature_flags', 'view');
  const actor = await getActor();
  const canEdit = actor.kind === 'user'
    && adminHasLevel(actor, 'feature_flags', 'manage');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, description, enabled, updated_at')
    .order('key');
  if (error) return <ErrorState description="تعذّر تحميل الميزات" />;

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">مفاتيح الميزات</h1>
        <p className="text-sm text-sand-600">
          الإطفاء يوقف المسار في القاعدة، لا في الواجهة وحدها.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Flag size={36} strokeWidth={1.5} />}
                    title="لا مفاتيح معرّفة" />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title="الميزات"
                      description={canEdit ? undefined
                        : 'للاطّلاع فقط — التبديل يحتاج صلاحية إدارة الميزات.'} />
          <ul className="divide-y divide-sand-200">
            {rows.map((f) => (
              <li key={f.key}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p dir="ltr" className="font-mono text-[13px] font-bold text-navy-900">
                    {f.key}
                  </p>
                  {f.description && (
                    <p className="text-xs text-sand-600">{f.description}</p>
                  )}
                  <p className="text-[11px] text-sand-600">
                    آخر تغيير {formatDateTime(f.updated_at)}
                  </p>
                </div>

                {canEdit ? (
                  <FeatureFlagToggle flagKey={f.key} enabled={f.enabled} />
                ) : (
                  <Badge tone={f.enabled ? 'success' : 'neutral'}>
                    {f.enabled ? 'مفعّلة' : 'متوقفة'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
