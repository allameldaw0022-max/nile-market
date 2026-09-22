import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import type { OrderDetails } from '@/components/storefront/OrderSummary';

/**
 * تفاصيل طلب للزبون.
 * البوابة في القاعدة (`order_details`): توكن الطلب أو رقم + هاتف.
 * الواجهة لا تقرر شيئًا — تمرّر ما بيدها وتعرض ما يعود.
 */
export async function readOrder(input: {
  storeId: string; orderNumber: string;
  guestToken?: string | null; phone?: string | null;
}): Promise<OrderDetails | null> {
  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'order_details', {
    p_store_id: input.storeId,
    p_order_number: input.orderNumber,
    p_guest_token: input.guestToken ?? null,
    p_phone: input.phone ?? null,
  });
  if (error) return null;

  const row = firstRow(data);
  if (!row) return null;

  const address = (row.delivery_address ?? {}) as { line?: string; landmark?: string | null };
  return {
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    deliveryZoneName: row.delivery_zone_name,
    deliveryAddress: address,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    discountTotal: Number(row.discount_total),
    total: Number(row.total),
    couponCode: row.coupon_code,
    note: row.note,
    createdAt: row.created_at,
    items: (row.items ?? []).map((i) => ({
      productName: i.product_name,
      variantName: i.variant_name,
      unitPrice: Number(i.unit_price),
      quantity: i.quantity,
      lineTotal: Number(i.line_total),
    })),
  };
}
