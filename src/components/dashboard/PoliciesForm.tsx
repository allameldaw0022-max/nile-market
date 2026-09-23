'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { saveStorePolicies } from '@/lib/settings/actions';

type Policies = { shipping: string; returns: string; privacy: string; terms: string };

const SECTIONS: { key: keyof Policies; title: string; hint: string }[] = [
  { key: 'shipping', title: 'سياسة الشحن والتوصيل',
    hint: 'مدة التوصيل، المناطق المغطاة، وما يحدث عند التأخير.' },
  { key: 'returns', title: 'سياسة الاستبدال والاسترجاع',
    hint: 'المدة المسموحة، وشروط قبول المنتج المرتجع.' },
  { key: 'privacy', title: 'سياسة الخصوصية',
    hint: 'ما تجمعه من بيانات الزبون وكيف تستخدمه.' },
  { key: 'terms', title: 'الشروط والأحكام',
    hint: 'شروط الشراء والالتزامات بين المتجر والزبون.' },
];

export function PoliciesForm({ storeId, initial, canEdit }: {
  storeId: string; initial: Policies; canEdit: boolean;
}) {
  const [values, setValues] = useState<Policies>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => start(async () => {
    setError(null);
    setSaved(false);
    const res = await saveStorePolicies({ storeId, policies: values });
    if (!res.ok) { setError(res.message); return; }
    setSaved(true);
  });

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3
                        text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {SECTIONS.map((section) => (
        <Card key={section.key}>
          <CardHeader title={section.title} description={section.hint} />
          <div className="p-5">
            <Textarea value={values[section.key]} disabled={!canEdit}
                      aria-label={section.title} maxLength={8000}
                      className="min-h-40"
                      onChange={(e) => {
                        setValues({ ...values, [section.key]: e.target.value });
                        setSaved(false);
                      }} />
            <p className="mt-1 text-xs text-ink-500 tabular">
              {values[section.key].length} / 8000
            </p>
          </div>
        </Card>
      ))}

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button size="lg" loading={pending} onClick={submit}>حفظ السياسات</Button>
          {saved && (
            <span role="status" className="inline-flex items-center gap-1 text-sm
                             font-bold text-success">
              <Check size={15} /> حُفظت
            </span>
          )}
        </div>
      )}
    </div>
  );
}
