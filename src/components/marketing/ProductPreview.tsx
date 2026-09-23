import { Bell, Package, Search, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { BarChart } from '@/components/ui/Chart';
import { formatMoney, formatNumber } from '@/lib/money/format';
import {
  DEMO_ORDERS, DEMO_PRODUCTS, DEMO_SALES, DEMO_STORE, DEMO_TOTALS,
} from './demo-data';
import type { StatusTone } from '@/lib/status';

/**
 * لقطات واجهة المنتج للموقع العام.
 *
 * ★ ليست صورًا ولا Mockups مرسومة: هذه عناصر حيّة مبنية من نفس
 * الأساسيات (Badge · BarChart · الطباعة · المسافات) التي تبني لوحة
 * التاجر. فما يراه الزائر هنا هو المنتج فعلًا لا رسمًا له — ولو
 * تغيّر نظام التصميم تغيّرت هذه اللقطات معه، فلا تتقادم.
 *
 * ★ كل لقطة `aria-hidden`: المحتوى المجاور يشرح الميزة نصًّا، فتكرارها
 * لقارئ الشاشة ضوضاء. والبيانات فيها بيانات عرض معلَنة (demo-data.ts).
 */

const STATUS: Record<DemoOrderStatus, { label: string; tone: StatusTone }> = {
  new:       { label: 'جديد',   tone: 'info' },
  confirmed: { label: 'مؤكَّد',  tone: 'neutral' },
  shipped:   { label: 'مُرسَل',  tone: 'warning' },
  delivered: { label: 'مُسلَّم', tone: 'success' },
};
type DemoOrderStatus = 'new' | 'confirmed' | 'shipped' | 'delivered';

/** إطار النافذة — شريط علوي محايد يوضّح أن ما بالداخل شاشة منتج. */
function Frame({ title, children, className = '' }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[--radius-xl] border border-ink-200 bg-white ${className}`}>
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <i className="size-2.5 rounded-full bg-ink-300" />
          <i className="size-2.5 rounded-full bg-ink-200" />
          <i className="size-2.5 rounded-full bg-ink-200" />
        </span>
        <p className="truncate text-[12px] font-medium text-ink-500">{title}</p>
      </div>
      {children}
    </div>
  );
}

/** الشاشة الرئيسية: مؤشّرات + منحنى مبيعات + أحدث الطلبات. */
export function DashboardPreview({ className = '' }: { className?: string }) {
  return (
    <Frame title={`لوحة ${DEMO_STORE}`} className={className}>
      <div aria-hidden className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: 'مبيعات الأسبوعين', v: formatMoney(DEMO_TOTALS.revenue) },
            { l: 'الطلبات',          v: formatNumber(DEMO_TOTALS.orders) },
            { l: 'العملاء',          v: formatNumber(DEMO_TOTALS.customers) },
            { l: 'متوسط الطلب',      v: formatMoney(DEMO_TOTALS.averageOrder) },
          ].map((s) => (
            <div key={s.l} className="rounded-[--radius-md] border border-ink-200 p-3">
              <p className="text-[11px] font-medium text-ink-500">{s.l}</p>
              <p className="mt-1 text-[15px] font-bold tabular text-ink-900 sm:text-base">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[--radius-md] border border-ink-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink-900">المبيعات — آخر ١٤ يومًا</p>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[--color-success]">
              <TrendingUp size={13} />١٨٪
            </span>
          </div>
          <BarChart className="mt-3" height={110} label="المبيعات اليومية"
                    data={DEMO_SALES} format={formatMoney} />
        </div>

        <div className="mt-4 hidden rounded-[--radius-md] border border-ink-200 sm:block">
          <p className="border-b border-ink-200 px-4 py-2.5 text-[13px] font-semibold text-ink-900">
            أحدث الطلبات
          </p>
          <ul>
            {DEMO_ORDERS.slice(0, 3).map((o) => (
              <li key={o.number}
                  className="flex items-center gap-3 border-b border-ink-100 px-4 py-2.5 last:border-0">
                <span className="w-12 shrink-0 text-[12px] font-semibold tabular text-ink-500">
                  #{o.number}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-900">{o.customer}</span>
                <span className="shrink-0 text-[13px] font-semibold tabular text-ink-900">
                  {formatMoney(o.total)}
                </span>
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Frame>
  );
}

/** شاشة الطلبات: جدول حقيقي بحالات وفلاتر. */
export function OrdersPreview({ className = '' }: { className?: string }) {
  return (
    <Frame title="الطلبات" className={className}>
      <div aria-hidden>
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <span className="inline-flex h-8 flex-1 items-center gap-2 rounded-[--radius-sm]
                           border border-ink-200 px-2.5 text-[12px] text-ink-400">
            <Search size={13} />بحث برقم الطلب أو الهاتف
          </span>
          {['الكل', 'جديد', 'مؤكَّد'].map((t, i) => (
            <span key={t} className={`hidden h-8 items-center rounded-[--radius-sm] px-3
                        text-[12px] font-medium sm:inline-flex
                        ${i === 1 ? 'bg-teal-600 text-white' : 'border border-ink-200 text-ink-600'}`}>
              {t}
            </span>
          ))}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {['الطلب', 'العميل', 'المدينة', 'الإجمالي', 'الحالة'].map((h, i) => (
                <th key={h} className={`border-b border-ink-200 bg-ink-50 px-4 py-2.5
                           text-[11px] font-semibold uppercase tracking-wide text-ink-500
                           ${i === 3 ? 'text-end' : 'text-start'}
                           ${i === 2 ? 'hidden sm:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_ORDERS.map((o) => (
              <tr key={o.number}>
                <td className="border-b border-ink-100 px-4 py-3 font-semibold tabular text-ink-500">
                  #{o.number}
                </td>
                <td className="border-b border-ink-100 px-4 py-3 text-ink-900">{o.customer}</td>
                <td className="hidden border-b border-ink-100 px-4 py-3 text-ink-500 sm:table-cell">
                  {o.city}
                </td>
                <td className="border-b border-ink-100 px-4 py-3 text-end font-semibold tabular text-ink-900">
                  {formatMoney(o.total)}
                </td>
                <td className="border-b border-ink-100 px-4 py-3">
                  <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

/** شاشة المنتجات: مخزون وحالة نفاد حقيقية. */
export function ProductsPreview({ className = '' }: { className?: string }) {
  return (
    <Frame title="المنتجات والمخزون" className={className}>
      <ul aria-hidden>
        {DEMO_PRODUCTS.map((p) => (
          <li key={p.name} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
            <span className="grid size-10 shrink-0 place-items-center rounded-[--radius-sm]
                             border border-ink-200 bg-ink-50 text-ink-400">
              <Package size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink-900">{p.name}</span>
              <span className="block text-[12px] tabular text-ink-500">
                بيع منه {formatNumber(p.sold)}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular text-ink-900">
              {formatMoney(p.price)}
            </span>
            <span className="w-20 shrink-0 text-end">
              {p.stock === 0
                ? <Badge tone="danger">نفد</Badge>
                : p.stock <= 5
                  ? <Badge tone="warning">{formatNumber(p.stock)} متبقٍ</Badge>
                  : <span className="text-[12px] tabular text-ink-500">{formatNumber(p.stock)} متوفّر</span>}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** المتجر على الهاتف — إطار جهاز ضيّق لا صورة جهاز مرسومة. */
export function MobilePreview({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden
         className={`mx-auto w-[248px] overflow-hidden rounded-[26px] border-[6px]
                     border-ink-800 bg-white ${className}`}>
      <div className="flex items-center justify-between bg-ink-800 px-4 pb-2 pt-1.5
                      text-[10px] font-medium text-white/70">
        <span className="tabular">٩:٤١</span>
        <span className="flex items-center gap-1"><Bell size={9} /></span>
      </div>
      <div className="border-b border-ink-200 px-3 py-2.5">
        <p className="truncate text-[13px] font-bold text-ink-900">{DEMO_STORE}</p>
        <span className="mt-2 flex h-7 items-center gap-1.5 rounded-[--radius-sm]
                         border border-ink-200 px-2 text-[11px] text-ink-400">
          <Search size={11} />ابحث عن منتج
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2.5">
        {DEMO_PRODUCTS.slice(0, 4).map((p) => (
          <div key={p.name} className="overflow-hidden rounded-[--radius-md] border border-ink-200">
            <div className="grid aspect-square place-items-center bg-ink-50 text-ink-300">
              <Package size={22} strokeWidth={1.5} />
            </div>
            <div className="p-2">
              <p className="line-clamp-2 text-[10px] leading-snug text-ink-700">{p.name}</p>
              <p className="mt-1 text-[11px] font-bold tabular text-ink-900">{formatMoney(p.price)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-200 p-2.5">
        <span className="flex h-9 items-center justify-center rounded-[--radius-md]
                         bg-teal-600 text-[12px] font-semibold text-white">
          إتمام الطلب
        </span>
      </div>
    </div>
  );
}
