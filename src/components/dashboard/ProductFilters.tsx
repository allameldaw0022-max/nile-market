'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { PRODUCT_STATUS } from '@/lib/status';

/**
 * البحث والفرز في عنوان الصفحة (URL) لا في حالة محلية: الرابط يبقى
 * قابلًا للمشاركة وزر الرجوع يعمل، والصفحة تبقى مُصيَّرة على الخادم.
 */
export function ProductFilters({ categories }: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    next.delete('page');   // أي تغيير في الترشيح يعيدنا للصفحة الأولى
    router.push(`/dashboard/products?${next.toString()}`);
  };

  // البحث يُطبَّق بعد 400ms من آخر حرف بدل نداء لكل ضغطة
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (term === current) return;
    const id = setTimeout(() => push({ q: term || null }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const select = 'h-10 rounded-[--radius-md] border border-sand-300 bg-white px-2.5 ' +
                 'text-[13px] font-bold text-navy-900 focus:border-nile-500';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-sand-400" />
        <input value={term} onChange={(e) => setTerm(e.target.value)}
               placeholder="ابحث بالاسم أو الرمز" aria-label="بحث في المنتجات"
               className="h-10 w-full rounded-[--radius-md] border border-sand-300 bg-white
                          ps-9 pe-8 text-[14px] text-navy-900 placeholder:text-sand-400
                          focus:border-nile-500" />
        {term && (
          <button type="button" aria-label="مسح البحث" onClick={() => setTerm('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-sand-500">
            <X size={14} />
          </button>
        )}
      </div>

      <select className={select} aria-label="تصفية بالحالة"
              value={params.get('status') ?? ''}
              onChange={(e) => push({ status: e.target.value })}>
        <option value="">كل الحالات</option>
        {Object.entries(PRODUCT_STATUS).map(([value, s]) => (
          <option key={value} value={value}>{s.label}</option>
        ))}
      </select>

      <select className={select} aria-label="تصفية بالتصنيف"
              value={params.get('category') ?? ''}
              onChange={(e) => push({ category: e.target.value })}>
        <option value="">كل التصنيفات</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <select className={select} aria-label="الترتيب"
              value={params.get('sort') ?? 'newest'}
              onChange={(e) => push({ sort: e.target.value })}>
        <option value="newest">الأحدث</option>
        <option value="name">الاسم</option>
        <option value="price_asc">الأرخص</option>
        <option value="price_desc">الأغلى</option>
        <option value="stock_asc">الأقل مخزونًا</option>
      </select>
    </div>
  );
}
