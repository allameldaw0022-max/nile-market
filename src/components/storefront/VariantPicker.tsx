'use client';
import { useState } from 'react';
import { formatMoney } from '@/lib/money/format';
import { AddToCartButton } from './AddToCartButton';

export type VariantOption = {
  id: string;
  name: string;
  /** سعر المتغيّر، أو `null` فيرث سعر المنتج. */
  price: number | null;
  available: number;
};

/**
 * مُختار متغيّرات المنتج (مقاس · لون · حجم).
 *
 * ★★ لماذا وُجد: الصفحة كانت تجلب `product_variants` ولا ترسمها، و
 * `AddToCartButton` يُنادى بلا `variantId`. فمنتجٌ بثلاثة مقاسات لا
 * يختار منه الزبون شيئًا، والسلّة تأخذ المنتج الأساس — بيعٌ مكسور لا
 * ميزة ناقصة. والأنابيب كانت موجودة: الزرّ يقبل `variantId` أصلًا،
 * و`inventory.variant_id` قائم منذ 0004.
 *
 * ★ التوفّر لكل متغيّر على حدة لا مجموعًا: جمع مخزون المقاسات كلّها
 * كان يَعِد بتوفّر مقاسٍ نفد. فالزرّ يقرأ رصيد المختار وحده.
 *
 * ★ ولا سعر يُرسَل من المتصفّح — المعرَّف فقط، والقاعدة تقرأ سعره.
 */
export function VariantPicker({
  host, productId, variants, basePrice, canCheckout, disabledNote,
}: {
  host: string;
  productId: string;
  variants: VariantOption[];
  basePrice: number;
  canCheckout: boolean;
  disabledNote?: string;
}) {
  // ★ أول متغيّر متوفّر هو المبدئي، وإلا فالأول: لا نفتح الصفحة على
  //   خيارٍ نافد ما دام غيره متاحًا.
  const [selected, setSelected] = useState(
    () => (variants.find((v) => v.available > 0) ?? variants[0]).id,
  );

  const current = variants.find((v) => v.id === selected) ?? variants[0];
  const price = current.price ?? basePrice;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-[13px] font-bold text-ink-700">اختر الخيار</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {variants.map((v) => {
            const out = v.available <= 0;
            const on = v.id === selected;
            return (
              <label
                key={v.id}
                htmlFor={`v-${v.id}`}
                className={`cursor-pointer rounded-md border px-4 py-2.5 text-sm font-semibold
                            ${on ? 'border-teal-600 bg-teal-50 text-teal-800'
                                 : 'border-ink-300 text-ink-700 hover:border-ink-400'}
                            ${out ? 'cursor-not-allowed line-through opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  id={`v-${v.id}`}
                  name="variant"
                  value={v.id}
                  checked={on}
                  disabled={out}
                  onChange={() => setSelected(v.id)}
                  className="sr-only"
                />
                {v.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ★ السعر يتبع المختار: متغيّراتٌ بأسعار مختلفة كانت تعرض سعر
          المنتج الأساس وحده، فيدفع الزبون غير ما رأى. */}
      <p className="text-2xl font-extrabold tabular text-teal-700" aria-live="polite">
        {formatMoney(price)}
      </p>

      <AddToCartButton
        host={host}
        productId={productId}
        /* ★ المفتاح: المعرَّف يصل السلّة الآن — وهو ما كان ناقصًا. */
        variantId={current.id}
        available={current.available}
        disabled={!canCheckout}
        disabledNote={disabledNote}
      />
    </div>
  );
}
