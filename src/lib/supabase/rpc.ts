import 'server-only';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * توقيعات دوال القاعدة المضافة بعد آخر توليد للأنواع.
 *
 * لماذا هذه الطبقة؟ `src/types/database.ts` مولَّد من المخطط، وتوليده
 * ملف ضخم. بدل إعادة توليده بعد كل migration، تُعلَن الدوال الجديدة
 * هنا بتوقيع صريح ومكتوب يدويًا، ويبقى التحويل محصورًا في مكان واحد
 * قابل للمراجعة بدل `as never` متناثرة في كل نداء.
 *
 * عند التوليد التالي تُحذف الدالة من هنا وتُستخدم من الأنواع المولَّدة.
 */
type Client = SupabaseClient<Database>;

export type MediaPurpose =
  | 'product_image' | 'store_logo' | 'store_banner' | 'category_image'
  | 'payment_proof' | 'support_attachment' | 'import_file' | 'export_file'
  | 'avatar';

export type ProductStatus = 'draft' | 'active' | 'hidden' | 'archived';

/** صف من ملف الاستيراد — كل القيم نصية كما تأتي من CSV/XLSX. */
export type ImportRow = {
  row?: number; name?: string; slug?: string; description?: string;
  price?: string; compare_at_price?: string; sku?: string;
  quantity?: string; category?: string;
};

export type ImportError = { row: number; name: string; message: string };

export type RpcMap = {
  create_store: {
    args: { p_name: string; p_slug: string;
            p_business_type?: string; p_visitor_token?: string };
    returns: { store_id: string; slug: string }[];
  };
  save_onboarding_step: {
    args: { p_store_id: string; p_step: string };
    returns: void;
  };
  publish_store: {
    args: { p_store_id: string };
    returns: { ok: boolean; missing: string[] }[];
  };
  is_slug_available: {
    args: { p_slug: string; p_store_id?: string };
    returns: boolean;
  };
  assert_within_limit: {
    args: { p_store_id: string; p_key: string };
    returns: void;
  };
  adjust_inventory: {
    args: { p_store_id: string; p_product_id: string; p_delta: number;
            p_reason?: string; p_variant_id?: string; p_note?: string };
    returns: { quantity: number }[];
  };
  prepare_upload: {
    args: { p_store_id: string; p_purpose: MediaPurpose;
            p_mime: string; p_size: number; p_ext?: string };
    returns: { media_id: string; bucket: string; path: string }[];
  };
  finalize_upload: {
    args: { p_media_id: string; p_width?: number | null;
            p_height?: number | null; p_blur?: string | null };
    returns: void;
  };
  save_product: {
    args: {
      p_store_id: string; p_name: string; p_price: number;
      p_product_id?: string | null; p_slug?: string | null;
      p_description?: string | null; p_compare_at_price?: number | null;
      p_cost_price?: number | null; p_sku?: string | null;
      p_category_id?: string | null; p_status?: ProductStatus | null;
      p_track_inventory?: boolean | null; p_weight_grams?: number | null;
      p_initial_quantity?: number | null; p_low_stock_threshold?: number | null;
      p_image_media_ids?: string[] | null; p_seo?: Record<string, unknown> | null;
    };
    returns: { product_id: string; slug: string }[];
  };
  duplicate_product: {
    args: { p_product_id: string };
    returns: { product_id: string; slug: string }[];
  };
  delete_product: {
    args: { p_product_id: string };
    returns: void;
  };
  cart_add_item: {
    args: { p_store_id: string; p_product_id: string; p_quantity: number;
            p_variant_id?: string | null; p_anon_token?: string | null };
    returns: { cart_id: string; quantity: number }[];
  };
  cart_set_quantity: {
    args: { p_store_id: string; p_item_id: string; p_quantity: number;
            p_anon_token?: string | null };
    returns: void;
  };
  cart_merge_guest: {
    args: { p_store_id: string; p_anon_token: string };
    returns: { cart_id: string; merged: number }[];
  };
  get_cart: {
    args: { p_store_id: string; p_anon_token?: string | null };
    returns: {
      cart_id: string; item_id: string; product_id: string;
      variant_id: string | null; product_name: string; variant_name: string | null;
      unit_price: number; quantity: number; line_total: number;
      available: number; image_path: string | null; image_bucket: string | null;
      product_slug: string;
    }[];
  };
  quote_checkout: {
    args: { p_store_id: string; p_anon_token?: string | null;
            p_zone_id?: string | null; p_coupon_code?: string | null };
    returns: {
      subtotal: number; delivery_fee: number; discount_total: number;
      total: number; coupon_valid: boolean; coupon_message: string | null;
      can_checkout: boolean; out_of_stock: boolean; item_count: number;
    }[];
  };
  create_order: {
    args: {
      p_store_id: string;
      p_items: { product_id: string; variant_id: string | null; quantity: number }[];
      p_zone_id: string | null;
      p_contact: { name: string; phone: string; email: string | null };
      p_address: { line: string; landmark: string | null };
      p_payment_method: 'cash_on_delivery' | 'bank_transfer' | 'bankak';
      p_coupon_code?: string | null;
      p_idempotency_key?: string | null;
      p_note?: string | null;
      p_cart_id?: string | null;
    };
    returns: {
      order_id: string; order_number: string; total: number; guest_token: string;
    }[];
  };
  order_details: {
    args: { p_store_id: string; p_order_number: string;
            p_guest_token?: string | null; p_phone?: string | null };
    returns: {
      order_id: string; order_number: string; status: string;
      payment_status: string; payment_method: string;
      contact_name: string; contact_phone: string;
      delivery_zone_name: string | null; delivery_address: Record<string, unknown>;
      subtotal: number; delivery_fee: number; discount_total: number; total: number;
      coupon_code: string | null; note: string | null; created_at: string;
      items: {
        product_name: string; variant_name: string | null;
        unit_price: number; quantity: number; line_total: number;
      }[];
    }[];
  };
  order_payment_instructions: {
    args: { p_store_id: string; p_order_number: string;
            p_guest_token?: string | null; p_phone?: string | null };
    returns: {
      bank_accounts: { bank?: string; account?: string; holder?: string }[];
      bankak_number: string | null;
      amount_due: number;
    }[];
  };
  my_orders: {
    args: { p_store_id: string };
    returns: {
      order_id: string; order_number: string; status: string;
      payment_status: string; total: number; created_at: string;
      item_count: number;
    }[];
  };
  track_order: {
    args: { p_store_id: string; p_order_number: string; p_phone: string };
    returns: {
      order_id: string; order_number: string; status: string;
      payment_status: string; total: number; created_at: string;
      item_count: number;
    }[];
  };
  verify_domain: {
    args: { p_domain_id: string; p_txt_records: string[] };
    returns: { verified: boolean; status: string; reason: string | null }[];
  };
  add_custom_domain: {
    args: { p_store_id: string; p_hostname: string };
    returns: { domain_id: string; verification_token: string }[];
  };
  set_primary_domain: {
    args: { p_domain_id: string };
    returns: void;
  };
  remove_custom_domain: {
    args: { p_domain_id: string };
    returns: void;
  };
  request_partner_payout: {
    args: { p_amount: number; p_note?: string | null;
            p_idempotency_key?: string | null };
    returns: { payout_id: string; amount: number }[];
  };
  approve_payout: {
    args: { p_payout_id: string };
    returns: void;
  };
  approve_refund: {
    args: { p_refund_id: string };
    returns: void;
  };
  submit_subscription_request: {
    args: { p_store_id: string; p_plan_id: string;
            p_reference?: string | null; p_proof_media_id?: string | null;
            p_idempotency_key?: string | null };
    returns: { request_id: string; net_amount: number }[];
  };
  cancel_subscription_request: {
    args: { p_request_id: string };
    returns: void;
  };
  platform_payment_info: {
    args: Record<string, never>;
    returns: {
      bank_accounts: { bank?: string; account?: string; holder?: string }[];
      bankak_number: string | null;
      payment_instructions: string | null;
    }[];
  };
  invite_store_member: {
    args: { p_store_id: string; p_email: string; p_role: string;
            p_permissions?: string[] };
    returns: { invitation_id: string; token: string; expires_at: string }[];
  };
  accept_store_invitation: {
    args: { p_token: string };
    returns: { store_id: string; role: string }[];
  };
  set_store_member_role: {
    args: { p_member_id: string; p_role: string; p_permissions?: string[] | null };
    returns: void;
  };
  remove_store_member: {
    args: { p_member_id: string };
    returns: void;
  };
  create_support_ticket: {
    args: { p_subject: string; p_category: string; p_body: string;
            p_store_id?: string; p_requester_kind?: string };
    returns: { ticket_id: string; ticket_number: string }[];
  };
  import_products: {
    args: { p_store_id: string; p_rows: ImportRow[]; p_dry_run: boolean };
    returns: { imported: number; failed: number; errors: ImportError[] }[];
  };
};

/**
 * نداء مكتوب النوع لدالة غير موجودة بعد في الأنواع المولَّدة.
 * يعيد النوع المعلَن في RpcMap لا اتحاد كل الدوال المولَّدة.
 */
export async function rpc<K extends keyof RpcMap>(
  client: Client, name: K, args: RpcMap[K]['args'],
): Promise<{ data: RpcMap[K]['returns'] | null; error: PostgrestError | null }> {
  // التحويل محصور هنا: الأنواع المولَّدة لا تعرف هذه الدوال بعد،
  // والتوقيعات أعلاه هي العقد المُراجَع.
  const call = client.rpc as unknown as (
    n: string, a: unknown,
  ) => Promise<{ data: unknown; error: PostgrestError | null }>;
  const { data, error } = await call(name as string, args);
  return { data: (data ?? null) as RpcMap[K]['returns'] | null, error };
}

/** أول صف من نتيجة دالة تعيد جدولًا. */
export function firstRow<T>(data: T[] | null | undefined): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : null;
}
