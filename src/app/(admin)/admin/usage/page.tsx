import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/supabase/rpc';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDateTime } from '@/lib/money/format';
import { MeasureNowButton } from './MeasureNowButton';

export const metadata: Metadata = {
  title: 'استهلاك الموارد',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  database: 'قاعدة البيانات',
  'storage.total': 'التخزين — الإجمالي',
  'storage.store-public': 'صور المتاجر (عامّة)',
  'storage.store-private': 'ملفات المتاجر (خاصّة)',
  'storage.support-attachments': 'مرفقات الدعم',
  'storage.avatars': 'صور الحسابات',
};

function mb(bytes: number): string {
  const v = bytes / 1048576;
  return v >= 1024
    ? `${(v / 1024).toLocaleString('ar-SD', { maximumFractionDigits: 2 })} غ.ب`
    : `${v.toLocaleString('ar-SD', { maximumFractionDigits: 1 })} م.ب`;
}

/** عتبات التنبيه — نفس السلّم في كل مورد. */
function band(pct: number | null) {
  if (pct === null) return { tone: 'neutral' as const, label: 'الحدّ غير معروف' };
  if (pct >= 95) return { tone: 'danger' as const, label: 'حرج' };
  if (pct >= 85) return { tone: 'warning' as const, label: 'تحذير' };
  if (pct >= 70) return { tone: 'gold' as const, label: 'مراقبة' };
  return { tone: 'success' as const, label: 'طبيعي' };
}

/**
 * استهلاك موارد المنصة.
 *
 * ★ الصفحة تقرأ **آخر قياس محفوظ** ولا تقيس عند كل فتح: القياس يمرّ
 * على `storage.objects` كلّها، وجعله في مسار العرض يجعل الصفحة نفسها
 * عبئًا على ما تراقبه. القياس يجري يوميًا مع الصيانة، وبزرّ عند الطلب.
 *
 * ★ لا رقم مخترع: حدّ الخطة إعلانٌ من المالك لا قياس، وغيابه يُعرض
 * «الحدّ غير معروف» — لا 0% ولا رقم افتراضي.
 */
export default async function UsagePage() {
  await requirePlatformAccess('system_health', 'view');

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'resource_usage_latest', {});
  if (error) return <ErrorState description="تعذّر قراءة القياسات" />;

  const rows = data ?? [];
  const alerts = rows.filter((r) => r.percentage !== null && r.percentage >= 85);
  const newest = rows.reduce<string | null>(
    (a, r) => (a && a > r.measured_at ? a : r.measured_at), null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink-900">استهلاك الموارد</h1>
          <p className="text-sm text-ink-500">
            {newest ? `آخر قياس: ${formatDateTime(newest)}` : 'لا قياس بعد'}
          </p>
        </div>
        <MeasureNowButton />
      </div>

      {alerts.length > 0 && (
        <Card className="border-danger/30 bg-danger-bg p-4">
          <p className="flex items-center gap-2 font-bold text-danger">
            <AlertTriangle size={16} />
            {alerts.some((a) => (a.percentage ?? 0) >= 95)
              ? 'مورد بلغ حدًّا حرجًا'
              : 'مورد يقارب حدّه'}
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-700">
            {alerts.map((a) => (
              <li key={a.resource}>
                {LABEL[a.resource] ?? a.resource} — {a.percentage}%
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="لا قياس محفوظ بعد"
          description="يجري القياس يوميًا مع الصيانة. اضغط «قِس الآن» لأخذ قياس فوري."
        />
      ) : (
        <Card>
          <CardHeader
            title="القياسات"
            description="أرقام مقيسة من القاعدة والتخزين مباشرة — لا تقديرات."
          />
          <div className="divide-y divide-ink-200">
            {rows.map((r) => {
              const b = band(r.percentage);
              return (
                <div key={r.resource}
                     className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">
                      {LABEL[r.resource] ?? r.resource}
                    </p>
                    <p className="text-xs text-ink-500">
                      {r.source}
                      {typeof r.detail?.file_count === 'number'
                        && ` · ${r.detail.file_count} ملفًا`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular text-ink-900">
                      {mb(r.value_bytes)}
                      {r.limit_bytes !== null && (
                        <span className="text-ink-500"> / {mb(r.limit_bytes)}</span>
                      )}
                    </span>
                    <Badge tone={b.tone}>
                      {r.percentage !== null ? `${r.percentage}% — ${b.label}` : b.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-ink-200 px-5 py-3 text-xs text-ink-500">
            حدّ الخطة لا يُقاس بل يُعلَن. لضبطه اكتب القيم بالبايت في
            <code className="mx-1 font-mono">platform_settings.resource_limits</code>
            بالمفتاحين <code className="font-mono">database</code> و
            <code className="mx-1 font-mono">storage</code>. ما لم يُضبط يبقى
            «الحدّ غير معروف» — ولا يُفترض له رقم.
          </p>
        </Card>
      )}
    </div>
  );
}
