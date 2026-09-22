'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, EyeOff, MoreVertical, Send, Trash2 } from 'lucide-react';
import {
  deleteProduct, duplicateProduct, setProductStatus,
} from '@/app/(dashboard)/dashboard/products/actions';
import type { ProductStatus } from '@/lib/supabase/rpc';

/**
 * إجراءات سريعة على صف المنتج.
 * كل إجراء يمر بـServer Action يفرض الصلاحية من جديد؛ إخفاء الزر
 * تحسين تجربة لا حماية.
 */
export function ProductRowActions({ storeId, productId, status, canDelete }: {
  storeId: string;
  productId: string;
  status: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => {
    setError(null);
    const res = await fn();
    setOpen(false);
    if (!res.ok) { setError(res.message ?? 'تعذّر تنفيذ الإجراء'); return; }
    router.refresh();
  });

  const changeStatus = (next: ProductStatus) =>
    run(() => setProductStatus(storeId, productId, next));

  const item = 'flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm ' +
               'font-medium text-navy-700 hover:bg-sand-50 disabled:opacity-50';

  return (
    <div className="relative">
      <button type="button" aria-label="إجراءات المنتج" aria-expanded={open}
              disabled={pending}
              onClick={() => setOpen(!open)}
              className="rounded p-2 text-sand-600 hover:bg-sand-100 disabled:opacity-50">
        <MoreVertical size={16} />
      </button>

      {open && (
        <>
          <button type="button" aria-label="إغلاق القائمة" className="fixed inset-0 z-30
                  cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-40 mt-1 w-52 overflow-hidden rounded-[--radius-md]
                          border border-sand-200 bg-white shadow-lg">
            {status !== 'active' && (
              <button type="button" className={item} disabled={pending}
                      onClick={() => changeStatus('active')}>
                <Send size={14} /> نشر المنتج
              </button>
            )}
            {status === 'active' && (
              <button type="button" className={item} disabled={pending}
                      onClick={() => changeStatus('hidden')}>
                <EyeOff size={14} /> إخفاء من المتجر
              </button>
            )}
            {status === 'hidden' && (
              <button type="button" className={item} disabled={pending}
                      onClick={() => changeStatus('active')}>
                <Eye size={14} /> إظهار في المتجر
              </button>
            )}
            <button type="button" className={item} disabled={pending}
                    onClick={() => run(async () => {
                      const res = await duplicateProduct(storeId, productId);
                      return res.ok ? { ok: true } : { ok: false, message: res.message };
                    })}>
              <Copy size={14} /> نسخ المنتج
            </button>
            {canDelete && (
              <button type="button" disabled={pending}
                      className={`${item} text-[--color-danger] hover:bg-[--color-danger-bg]`}
                      onClick={() => {
                        if (!confirm('حذف هذا المنتج؟ تبقى الطلبات السابقة كما هي.')) return;
                        run(() => deleteProduct(storeId, productId));
                      }}>
                <Trash2 size={14} /> حذف
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="absolute end-0 top-full z-40 mt-1 w-56 rounded-[--radius-md]
                        border border-[--color-danger]/30 bg-[--color-danger-bg] p-2
                        text-xs text-[--color-danger]">
          {error}
        </p>
      )}
    </div>
  );
}
