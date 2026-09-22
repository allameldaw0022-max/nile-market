import type { Metadata } from 'next';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/States';
import { formatDateTime, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'صحة النظام — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const CHECK_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  healthy: 'success', degraded: 'warning', down: 'danger',
};

/**
 * صحة النظام.
 *
 * ★ `email_outbox` و`job_queue` مغلقان على service_role — الأرقام هنا
 * عدّ مجمّع من دالة مُحكمة، لا قراءة صفوف. لا يقرأ موظف عناوين بريد
 * المستخدمين ليطمئن أن الطابور يعمل.
 */
export default async function AdminHealthPage() {
  await requirePlatformAccess('system_health', 'view');

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'system_health', {});
  if (error || !data) return <ErrorState description="تعذّر قراءة حالة النظام" />;

  const h = data;
  const alerts: string[] = [];
  if (h.email.failed > 0) alerts.push(`${h.email.failed} رسالة بريد فشل إرسالها`);
  if (h.jobs.failed > 0) alerts.push(`${h.jobs.failed} مهمة خلفية فاشلة`);
  if (h.jobs.stuck > 0) alerts.push(`${h.jobs.stuck} مهمة محجوزة منذ أكثر من ساعة`);
  if (h.subscriptions.stale_sweep > 0) {
    alerts.push(
      `${h.subscriptions.stale_sweep} اشتراك انتهت مدّته ولم تمرّ عليه المهمة اليومية`);
  }
  if (h.maintenance_mode) alerts.push('وضع الصيانة مُفعَّل — الواجهة محجوبة عن التجار');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">صحة النظام</h1>
        <p className="text-sm text-ink-500">
          قُرئت {formatDateTime(h.generated_at)}.
        </p>
      </div>

      {alerts.length > 0 ? (
        <Card className="border-[--color-danger]/30 bg-[--color-danger-bg] p-5">
          <h2 className="flex items-center gap-2 font-bold text-[--color-danger]">
            <AlertTriangle size={17} />
            يحتاج انتباهك
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-700">
            {alerts.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Card>
      ) : (
        <Card className="border-[--color-success]/25 bg-[--color-success-bg] p-5">
          <p className="flex items-center gap-2 font-bold text-[--color-success]">
            <CheckCircle2 size={17} />
            لا تنبيهات — الطوابير والمهام تسير.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="البريد الصادر"
                    description="الطابور يُفرَّغ كل عشر دقائق بمهمة مجدولة." />
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          <StatCard label="بالانتظار" value={formatNumber(h.email.queued)} />
          <StatCard label="قيد الإرسال" value={formatNumber(h.email.sending)} />
          <StatCard label="فشل" value={formatNumber(h.email.failed)} />
          <StatCard label="أُرسل (24 ساعة)" value={formatNumber(h.email.sent_24h)} />
        </div>
        {h.email.oldest_queued_at && (
          <p className="border-t border-ink-200 px-5 py-3 text-xs text-ink-500">
            أقدم رسالة منتظرة منذ {formatDateTime(h.email.oldest_queued_at)}
            {h.email.last_error && (
              <span className="mt-1 block text-[--color-danger]">
                آخر خطأ: {h.email.last_error}
              </span>
            )}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="المهام الخلفية" />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <StatCard label="بالانتظار" value={formatNumber(h.jobs.pending)} />
            <StatCard label="فاشلة" value={formatNumber(h.jobs.failed)} />
            <StatCard label="محجوزة" value={formatNumber(h.jobs.stuck)} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="الاشتراكات والدومينات" />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <StatCard label="فترة سماح" value={formatNumber(h.subscriptions.grace)} />
            <StatCard label="قاربت الانتهاء"
                      value={formatNumber(h.subscriptions.expiring)} />
            <StatCard label="دومينات بانتظار التحقق"
                      value={formatNumber(h.domains.pending)} />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="فحوص المكوّنات"
                    description={`التخزين المستخدم: ${formatNumber(h.storage_mb)} م.ب`} />
        {h.checks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">
            لم تُسجَّل فحوص بعد — تكتبها المهام المجدولة عند تشغيلها.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {h.checks.map((c) => (
              <li key={c.component}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="flex flex-1 items-center gap-2 font-bold text-ink-900">
                  <Activity size={15} className="text-ink-400" />
                  {c.component}
                </span>
                {c.latency_ms !== null && (
                  <span className="text-xs tabular text-ink-500">{c.latency_ms} مث</span>
                )}
                <span className="text-xs text-ink-500">
                  {formatDateTime(c.checked_at)}
                </span>
                <Badge tone={CHECK_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                {c.detail && (
                  <p className="w-full text-xs text-ink-500">{c.detail}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
