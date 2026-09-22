'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, Copy, ExternalLink, Globe, RefreshCw, Star, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/money/format';
import {
  addCustomDomain, checkDomainVerification, removeCustomDomain, setPrimaryDomain,
  type StoreDomain,
} from '@/lib/domains/actions';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'نشط', tone: 'success' },
  pending: { label: 'قيد الإعداد', tone: 'warning' },
  verification_required: { label: 'يحتاج تحققًا', tone: 'warning' },
  failed: { label: 'فشل التحقق', tone: 'danger' },
  released: { label: 'محرَّر', tone: 'neutral' },
};

/**
 * إدارة دومينات المتجر.
 *
 * التحقق يُشغَّل من هنا، لكنه لا يُحسم هنا: الخادم يقرأ سجل TXT
 * بنفسه ثم يسجّل النتيجة. لا يوجد مسار يجعل المتصفح يُعلن نجاح تحقق.
 */
export function DomainManager({ storeId, domains, canManage, rootDomain }: {
  storeId: string;
  domains: StoreDomain[];
  canManage: boolean;
  rootDomain: string;
}) {
  const router = useRouter();
  const [hostname, setHostname] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () => start(async () => {
    setError(null);
    setNotice(null);
    const res = await addCustomDomain({ storeId, hostname });
    if (!res.ok) { setError({ message: res.message, field: res.field }); return; }
    setHostname('');
    setAdding(false);
    router.refresh();
  });

  const check = (domain: StoreDomain) => start(async () => {
    setError(null);
    setNotice(null);
    const res = await checkDomainVerification({ storeId, domainId: domain.id });
    if (!res.ok) { setError({ message: res.message }); return; }
    setNotice(res.data.verified
      ? `تم التحقق من ${domain.hostname} — يمكنك جعله الدومين الأساسي.`
      : res.data.reason ?? 'لم يكتمل التحقق بعد.');
    router.refresh();
  });

  const makePrimary = (domain: StoreDomain) => start(async () => {
    setError(null);
    setNotice(null);
    const res = await setPrimaryDomain({ storeId, domainId: domain.id });
    if (!res.ok) { setError({ message: res.message }); return; }
    router.refresh();
  });

  const remove = (domain: StoreDomain) => start(async () => {
    setError(null);
    setNotice(null);
    const res = await removeCustomDomain({ storeId, domainId: domain.id });
    if (!res.ok) { setError({ message: res.message }); return; }
    router.refresh();
  });

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* المتصفح منع الحافظة — المستخدم ينسخ يدويًا */ }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-[--radius-md] border border-nile-300
                        bg-[--color-info-bg] p-3 text-sm text-navy-700">
          {notice}
        </div>
      )}

      <ul className="space-y-3">
        {domains.map((domain) => {
          const status = STATUS[domain.status]
            ?? { label: domain.status, tone: 'neutral' as const };
          const needsDns = domain.kind === 'custom' && domain.status !== 'active';
          const txtHost = `_nile-market.${domain.hostname}`;
          const txtValue = `nile-market-verification=${domain.verificationToken ?? ''}`;

          return (
            <li key={domain.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-3 border-b border-sand-200
                                px-5 py-4">
                  <Globe size={18} className="text-sand-500" />
                  <a href={`https://${domain.hostname}`} target="_blank"
                     rel="noopener noreferrer" dir="ltr"
                     className="min-w-0 flex-1 truncate font-bold text-navy-900
                                hover:text-nile-600">
                    {domain.hostname}
                    <ExternalLink size={12} className="ms-1 inline" />
                  </a>

                  {domain.isPrimary && (
                    <Badge tone="info" icon={<Star size={10} />}>الأساسي</Badge>
                  )}
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>

                <div className="space-y-4 px-5 py-4">
                  {needsDns && (
                    <div className="space-y-3 rounded-[--radius-md] border border-sand-200
                                    bg-sand-50 p-4">
                      <p className="text-sm font-bold text-navy-900">
                        أضف سجل TXT التالي عند مزوّد الدومين
                      </p>
                      <p className="text-xs text-sand-600">
                        ننشر التوكن على اسم فرعي مستقل حتى لا نمسّ سجلات
                        الجذر (مثل SPF) فيتعطّل بريدك.
                      </p>

                      <DnsRow label="النوع" value="TXT" />
                      <DnsRow label="الاسم" value={txtHost}
                              onCopy={() => copy(txtHost, `${domain.id}-host`)}
                              copied={copied === `${domain.id}-host`} />
                      <DnsRow label="القيمة" value={txtValue}
                              onCopy={() => copy(txtValue, `${domain.id}-value`)}
                              copied={copied === `${domain.id}-value`} />

                      <p className="border-t border-sand-200 pt-3 text-sm font-bold
                                    text-navy-900">
                        ثم وجّه الدومين إلى المنصة
                      </p>
                      <DnsRow label="النوع" value="CNAME" />
                      <DnsRow label="الاسم" value={domain.hostname.split('.')[0]} />
                      <DnsRow label="القيمة" value={`cname.${rootDomain}`}
                              onCopy={() => copy(`cname.${rootDomain}`, `${domain.id}-cname`)}
                              copied={copied === `${domain.id}-cname`} />

                      {domain.failureReason && (
                        <p className="text-xs font-bold text-[--color-danger]">
                          آخر محاولة: {domain.failureReason}
                        </p>
                      )}
                      {domain.lastCheckedAt && (
                        <p className="text-xs text-sand-600">
                          آخر فحص: {formatDateTime(domain.lastCheckedAt)}
                        </p>
                      )}
                    </div>
                  )}

                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {needsDns && (
                        <Button variant="outline" size="sm" loading={pending}
                                icon={<RefreshCw size={14} />}
                                onClick={() => check(domain)}>
                          فحص التحقق الآن
                        </Button>
                      )}
                      {!domain.isPrimary && domain.status === 'active' && (
                        <Button variant="outline" size="sm" loading={pending}
                                icon={<Star size={14} />}
                                onClick={() => makePrimary(domain)}>
                          اجعله الأساسي
                        </Button>
                      )}
                      {domain.kind === 'custom' && (
                        <Button variant="ghost" size="sm" loading={pending}
                                icon={<Trash2 size={14} />}
                                onClick={() => {
                                  if (confirm(`حذف ${domain.hostname}؟`)) remove(domain);
                                }}>
                          حذف
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {canManage && (
        adding ? (
          <Card>
            <CardHeader title="ربط دومين مخصص"
                        description="يجب أن تملك الدومين وتستطيع تعديل سجلات الـDNS." />
            <div className="space-y-3 p-5">
              <Input label="الدومين" value={hostname} dir="ltr"
                     placeholder="shop.example.com"
                     onChange={(e) => setHostname(e.target.value)}
                     error={error?.field === 'hostname' ? error.message : undefined} />
              <div className="flex gap-2">
                <Button loading={pending} disabled={hostname.trim().length < 4}
                        onClick={add}>
                  إضافة الدومين
                </Button>
                <Button variant="ghost" onClick={() => { setAdding(false); setError(null); }}>
                  إلغاء
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button variant="outline" icon={<Globe size={16} />}
                  onClick={() => setAdding(true)}>
            ربط دومين مخصص
          </Button>
        )
      )}
    </div>
  );
}

function DnsRow({ label, value, onCopy, copied }: {
  label: string; value: string; onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-xs font-bold text-sand-600">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5
                       text-xs text-navy-900" dir="ltr">{value}</code>
      {onCopy && (
        <button type="button" onClick={onCopy}
                aria-label={`نسخ ${label}`}
                className="rounded p-1.5 text-sand-600 hover:bg-white hover:text-nile-600">
          {copied ? <Check size={14} className="text-[--color-success]" /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
}
