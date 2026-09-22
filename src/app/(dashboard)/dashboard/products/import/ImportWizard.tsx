'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { UpgradeCard } from '@/components/ui/States';
import { parseCsv } from '@/lib/import/csv';
import { parseXlsx, XlsxUnsupported } from '@/lib/import/xlsx';
import {
  IMPORT_FIELDS, buildRows, mapHeaders, missingRequired,
  type ImportField,
} from '@/lib/import/columns';
import { importProducts } from '@/app/(dashboard)/dashboard/products/actions';
import type { ImportError, ImportRow } from '@/lib/supabase/rpc';

type Stage = 'upload' | 'preview' | 'done';

const MAX_ROWS = 2000;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * استيراد المنتجات: رفع ← مطابقة أعمدة ← معاينة بالتحقق الحقيقي
 * ← استيراد ← تقرير أخطاء.
 *
 * الملف يُقرأ ويُطابَق في المتصفح (لا رفع ملف إلى الخادم)، لكن
 * **التحقق الفاصل يحدث في القاعدة**: مرحلة المعاينة تنادي
 * `import_products` بـdry-run، فما يُعرض هو نفس ما سيُكتب — لا تقدير
 * من الواجهة.
 */
export function ImportWizard({ storeId }: { storeId: string }) {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [table, setTable] = useState<string[][]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [counts, setCounts] = useState({ imported: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStage('upload');
    setFileName(''); setHeaders([]); setMapping([]); setTable([]);
    setRows([]); setErrors([]); setCounts({ imported: 0, failed: 0 });
    setError(null); setLimit(null);
  };

  const readFile = (file: File) => start(async () => {
    setError(null);
    setLimit(null);
    setFileName(file.name);

    if (file.size > MAX_BYTES) {
      setError('حجم الملف يتجاوز 5 ميجابايت — قسّمه إلى ملفين.');
      return;
    }

    let grid: string[][];
    try {
      grid = /\.xlsx$/i.test(file.name)
        ? await parseXlsx(file)
        : parseCsv(await file.text());
    } catch (err) {
      setError(err instanceof XlsxUnsupported
        ? `${err.message} — احفظ الملف بصيغة CSV وأعد المحاولة.`
        : 'تعذّر قراءة الملف. تأكد أنه CSV أو Excel (xlsx) غير محمي بكلمة مرور.');
      return;
    }

    if (grid.length < 2) {
      setError('الملف لا يحتوي على صفوف بيانات تحت الترويسة.');
      return;
    }
    if (grid.length - 1 > MAX_ROWS) {
      setError(`الحد الأقصى ${MAX_ROWS} صف في الملف الواحد.`);
      return;
    }

    const head = grid[0].map((h) => h.trim());
    const guessed = mapHeaders(head);
    setHeaders(head);
    setMapping(guessed);
    setTable(grid);

    const missing = missingRequired(guessed);
    if (missing.length > 0) {
      setError(
        'لم نتعرّف على أعمدة إلزامية: ' +
        missing.map((f) => IMPORT_FIELDS[f].label).join(' · ') +
        ' — اربطها يدويًا بالأسفل.',
      );
    }
    setStage('preview');
    void validate(grid, guessed);
  });

  const validate = (grid: string[][], map: (ImportField | null)[]) => start(async () => {
    if (missingRequired(map).length > 0) return;
    const built = buildRows(grid, map);
    setRows(built);

    const res = await importProducts({ storeId, rows: built, dryRun: true });
    if (!res.ok) {
      if (res.code === 'FEATURE_DISABLED' || res.code === 'LIMIT_EXCEEDED') setLimit(res.message);
      else setError(res.message);
      return;
    }
    setError(null);
    setCounts({ imported: res.data.imported, failed: res.data.failed });
    setErrors(res.data.errors);
  });

  const commit = () => start(async () => {
    const res = await importProducts({ storeId, rows, dryRun: false });
    if (!res.ok) {
      if (res.code === 'FEATURE_DISABLED' || res.code === 'LIMIT_EXCEEDED') setLimit(res.message);
      else setError(res.message);
      return;
    }
    setCounts({ imported: res.data.imported, failed: res.data.failed });
    setErrors(res.data.errors);
    setStage('done');
  });

  const remap = (column: number, field: ImportField | null) => {
    // الحقل لا يُربط بعمودين: الربط الجديد يفكّ القديم
    const next = mapping.map((f, i) =>
      (field !== null && f === field && i !== column ? null : f));
    next[column] = field;
    setMapping(next);
    setError(null);
    void validate(table, next);
  };

  const downloadErrors = () => {
    const lines = [['الصف', 'الاسم', 'السبب'],
      ...errors.map((e) => [String(e.row), e.name, e.message])];
    const csv = '﻿' + lines
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (stage === 'done') {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto text-[--color-success]" size={40} />
        <h2 className="mt-3 text-lg font-extrabold text-navy-900">
          تم استيراد <span className="tabular">{counts.imported}</span> منتجًا
        </h2>
        <p className="mt-1 text-sm text-sand-600">
          المنتجات المستوردة مسودّات — راجعها ثم انشرها.
          {counts.failed > 0 && ` تعذّر استيراد ${counts.failed} صفًا.`}
        </p>

        {errors.length > 0 && <ErrorTable errors={errors} onDownload={downloadErrors} />}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/dashboard/products">
            <Button>الانتقال إلى المنتجات</Button>
          </Link>
          <Button variant="outline" onClick={reset} icon={<RefreshCw size={15} />}>
            استيراد ملف آخر
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {limit && <UpgradeCard message={limit} />}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {stage === 'upload' && (
        <Card>
          <CardHeader title="اختر الملف"
                      description="CSV أو Excel (xlsx) — حتى 2000 صف و5 ميجابايت." />
          <div className="space-y-4 p-5">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={pending}
                    className="flex w-full flex-col items-center justify-center gap-2
                               rounded-[--radius-lg] border border-dashed border-sand-300
                               bg-white py-12 text-sand-600 hover:border-nile-400
                               hover:text-nile-600 disabled:opacity-60">
              <Upload size={30} strokeWidth={1.5} />
              <span className="font-bold">اضغط لاختيار ملف</span>
              <span className="text-xs">أو اسحبه إلى هنا</span>
            </button>

            <div className="rounded-[--radius-md] border border-sand-200 bg-sand-50 p-4">
              <p className="text-sm font-bold text-navy-900">الأعمدة المتوقَّعة</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => (
                  <li key={f} className="rounded-full border border-sand-300 bg-white
                                         px-2.5 py-0.5 text-xs font-bold text-navy-700">
                    {IMPORT_FIELDS[f].label}
                    {IMPORT_FIELDS[f].required && (
                      <span className="text-[--color-danger]" aria-label="إلزامي"> *</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-sand-600">
                نتعرّف على الترويسات العربية والإنجليزية تلقائيًا، وما لا نتعرّف
                عليه يمكنك ربطه يدويًا في الخطوة التالية.
              </p>
              <a href="/dashboard/products/import/template" download className="mt-3 inline-block">
                <Button type="button" variant="outline" size="sm"
                        icon={<Download size={14} />}>
                  تنزيل ملف نموذجي
                </Button>
              </a>
            </div>
          </div>

          <input ref={inputRef} type="file" className="sr-only"
                 accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                 onChange={(e) => {
                   const file = e.target.files?.[0];
                   e.target.value = '';
                   if (file) readFile(file);
                 }} />
        </Card>
      )}

      {stage === 'preview' && (
        <>
          <Card>
            <CardHeader title="ربط الأعمدة"
                        description={`${fileName} — ${table.length - 1} صف.`} />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {headers.map((header, i) => (
                <label key={`${header}-${i}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">
                    {header || `عمود ${i + 1}`}
                  </span>
                  <select value={mapping[i] ?? ''}
                          onChange={(e) => remap(i, (e.target.value || null) as ImportField | null)}
                          className="h-9 w-40 rounded-[--radius-md] border border-sand-300
                                     bg-white px-2 text-[13px] font-bold text-navy-900
                                     focus:border-nile-500">
                    <option value="">— غير مستخدم —</option>
                    {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => (
                      <option key={f} value={f}>{IMPORT_FIELDS[f].label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="المعاينة"
                        description="نتيجة التحقق الفعلي في القاعدة — بلا أي كتابة بعد." />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-3">
                <Stat label="صف جاهز للاستيراد" value={counts.imported} tone="success" />
                <Stat label="صف فيه خطأ" value={counts.failed}
                      tone={counts.failed > 0 ? 'danger' : 'neutral'} />
              </div>

              {errors.length > 0 && <ErrorTable errors={errors} onDownload={downloadErrors} />}

              {counts.imported > 0 && (
                <PreviewTable rows={rows} errors={errors} />
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" loading={pending} disabled={counts.imported === 0}
                    icon={<FileSpreadsheet size={16} />} onClick={commit}>
              استيراد {counts.imported} منتجًا
            </Button>
            <Button variant="ghost" onClick={reset}>اختيار ملف آخر</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: {
  label: string; value: number; tone: 'success' | 'danger' | 'neutral';
}) {
  const cls = tone === 'success' ? 'text-[--color-success]'
    : tone === 'danger' ? 'text-[--color-danger]' : 'text-navy-900';
  return (
    <div className="rounded-[--radius-md] border border-sand-200 px-4 py-3">
      <p className="text-xs font-medium text-sand-600">{label}</p>
      <p className={`text-xl font-extrabold tabular ${cls}`}>{value}</p>
    </div>
  );
}

function ErrorTable({ errors, onDownload }: {
  errors: ImportError[]; onDownload: () => void;
}) {
  return (
    <div className="rounded-[--radius-md] border border-[--color-danger]/30
                    bg-[--color-danger-bg] p-4 text-start">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-navy-900">
          صفوف لم تُستورَد (<span className="tabular">{errors.length}</span>)
        </p>
        <Button type="button" variant="outline" size="sm" icon={<Download size={13} />}
                onClick={onDownload}>
          تنزيل تقرير الأخطاء
        </Button>
      </div>
      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
        {errors.slice(0, 100).map((e, i) => (
          <li key={`${e.row}-${i}`} className="flex flex-wrap gap-x-2 text-navy-700">
            <span className="font-bold tabular">صف {e.row}</span>
            {e.name && <span className="truncate">{e.name}</span>}
            <span className="text-[--color-danger]">{e.message}</span>
          </li>
        ))}
      </ul>
      {errors.length > 100 && (
        <p className="mt-2 text-xs text-sand-600">
          نعرض أول 100 خطأ — التقرير الكامل في الملف.
        </p>
      )}
    </div>
  );
}

function PreviewTable({ rows, errors }: { rows: ImportRow[]; errors: ImportError[] }) {
  const bad = new Set(errors.map((e) => e.row));
  const good = rows.filter((r) => !bad.has(r.row ?? -1)).slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-[--radius-md] border border-sand-200">
      <table className="w-full text-sm">
        <thead className="bg-sand-50 text-start">
          <tr>
            <th className="px-3 py-2 text-start font-bold text-navy-700">الاسم</th>
            <th className="px-3 py-2 text-start font-bold text-navy-700">السعر</th>
            <th className="px-3 py-2 text-start font-bold text-navy-700">الكمية</th>
            <th className="px-3 py-2 text-start font-bold text-navy-700">التصنيف</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-200">
          {good.map((r) => (
            <tr key={r.row}>
              <td className="max-w-40 truncate px-3 py-2 text-navy-900">{r.name}</td>
              <td className="px-3 py-2 tabular text-navy-900" dir="ltr">{r.price}</td>
              <td className="px-3 py-2 tabular text-navy-900" dir="ltr">{r.quantity ?? '0'}</td>
              <td className="px-3 py-2 text-sand-600">{r.category ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > good.length && (
        <p className="border-t border-sand-200 px-3 py-2 text-xs text-sand-600">
          أول {good.length} صف من {rows.length}.
        </p>
      )}
    </div>
  );
}
