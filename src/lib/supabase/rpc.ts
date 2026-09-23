import 'server-only';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

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

/** ناتج `system_health()` — أرقام مجمّعة لا صفوفًا. */
export type SystemHealth = {
  email: {
    queued: number; sending: number; failed: number; sent_24h: number;
    oldest_queued_at: string | null; last_error: string | null;
  };
  jobs: { pending: number; failed: number; stuck: number };
  subscriptions: { grace: number; expiring: number; stale_sweep: number };
  domains: { pending: number };
  storage_mb: number;
  maintenance_mode: boolean;
  checks: {
    component: string; status: string; latency_ms: number | null;
    detail: string | null; checked_at: string;
  }[];
  generated_at: string;
};

export type SeriesPoint = { date: string; count?: number; amount?: number };

/** ناتج `platform_reports()`. */
export type PlatformReports = {
  days: number;
  from: string;
  revenue_series: SeriesPoint[];
  stores_series: SeriesPoint[];
  orders_series: SeriesPoint[];
  by_plan: { plan: string; count: number; amount: number }[];
  commissions: { accrued: number; payable: number; paid_period: number };
  totals: { revenue: number; stores: number; orders: number; gmv: number };
  top_stores: { store: string; orders: number; amount: number }[];
};

/** ناتج `support_ticket_admin()` — الملاحظات الداخلية في مفتاح منفصل. */
export type AdminTicket = {
  id: string; ticket_number: string; subject: string;
  category: string; status: string; priority: string;
  created_at: string; last_message_at: string;
  first_response_at: string | null; reopened_count: number;
  assigned_to: string | null;
  requester_name: string | null;
  store_id: string | null; store_name: string | null;
  messages: {
    id: string; author_kind: string; body: string;
    author_name: string | null; created_at: string;
  }[];
  notes: {
    id: string; body: string; created_at: string; author_name: string | null;
  }[];
  events: {
    event: string; from_value: string | null; to_value: string | null;
    created_at: string; actor_name: string | null;
  }[];
};

/** ناتج `store_analytics()` — أرقام مجمَّعة لا صفوف زيارات. */
export type StoreAnalytics = {
  days: number;
  from: string;
  series: {
    date: string; visits: number; visitors: number;
    orders: number; revenue: number;
  }[];
  totals: {
    visits: number; visitors: number; orders: number; revenue: number;
    new_customers: number; items_sold: number;
    /** null ⇒ لا زوّار في المدة: «لا نعرف» ليست «صفر بالمئة». */
    conversion: number | null;
    aov: number | null;
  };
  top_products: { name: string; quantity: number; revenue: number }[];
  top_pages: { path: string; visits: number }[];
  by_status: Record<string, number>;
};

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
  resource_usage_latest: {
    args: Record<string, never>;
    returns: {
      resource: string; value_bytes: number; limit_bytes: number | null;
      percentage: number | null; source: string;
      detail: { file_count?: number }; measured_at: string;
    }[];
  };
  record_resource_usage: {
    args: Record<string, never>;
    returns: number;
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
  admin_overview: {
    args: Record<string, never>;
    returns: Record<string, number>;
  };
  review_subscription_request: {
    args: { p_request_id: string; p_action: 'approve' | 'reject';
            p_reason?: string | null };
    returns: { status: string; payment_id?: string };
  };
  review_payout: {
    args: { p_payout_id: string; p_action: 'record' | 'approve' | 'reject';
            p_reason?: string | null };
    returns: { status: string };
  };
  set_store_status: {
    args: { p_store_id: string; p_status: string; p_reason?: string | null };
    returns: void;
  };
  mark_payout_paid: {
    args: { p_payout_id: string; p_reference?: string | null };
    returns: number;
  };
  run_daily_maintenance: {
    args: Record<string, never>;
    returns: Record<string, unknown>;
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
  toggle_wishlist: {
    args: { p_product_id: string };
    returns: { in_wishlist: boolean; store_id: string }[];
  };
  wishlist_state: {
    args: { p_product_ids: string[] };
    returns: { product_id: string }[];
  };
  my_wishlist: {
    args: { p_store_id: string };
    returns: {
      product_id: string; name: string; slug: string;
      price: number; compare_at_price: number | null;
      has_variants: boolean; track_inventory: boolean;
      available: number;
      image_bucket: string | null; image_path: string | null;
      image_blur: string | null;
    }[];
  };
  prepare_support_upload: {
    args: { p_ticket_id: string; p_mime: string; p_size: number };
    returns: { media_id: string; bucket: string; path: string }[];
  };
  attach_to_ticket: {
    args: { p_ticket_id: string; p_media_id: string; p_message_id?: string | null };
    returns: string;
  };
  ticket_attachments: {
    args: { p_ticket_id: string };
    returns: {
      id: string; message_id: string | null; media_id: string;
      mime_type: string; size_bytes: number; path: string; created_at: string;
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
            p_store_id?: string | null; p_requester_kind?: string };
    returns: { ticket_id: string; ticket_number: string }[];
  };
  reply_to_ticket: {
    args: { p_ticket_id: string; p_body: string };
    returns: void;
  };
  close_my_ticket: {
    args: { p_ticket_id: string };
    returns: void;
  };
  mark_notifications_read: {
    args: { p_ids?: string[] | null };
    returns: number;
  };
  claim_emails: {
    args: { p_limit?: number };
    returns: {
      id: string; to_email: string; template: string;
      payload: Record<string, unknown>; attempts: number;
    }[];
  };
  mark_email_sent: {
    args: { p_id: string };
    returns: void;
  };
  mark_email_failed: {
    args: { p_id: string; p_error: string };
    returns: void;
  };
  import_products: {
    args: { p_store_id: string; p_rows: ImportRow[]; p_dry_run: boolean };
    returns: { imported: number; failed: number; errors: ImportError[] }[];
  };

  // ── أقسام لوحة الإدارة (0030) ──────────────────────────────────────
  payments_page: {
    args: { p_status?: string | null; p_kind?: string | null;
            p_search?: string | null; p_limit?: number; p_offset?: number };
    returns: {
      payment_id: string; kind: string; method: string; status: string;
      amount: number; reference: string | null; store_id: string | null;
      store_name: string | null; order_number: string | null;
      paid_at: string | null; created_at: string; total_count: number;
    }[];
  };
  platform_users: {
    args: { p_search?: string | null; p_status?: string | null;
            p_limit?: number; p_offset?: number };
    returns: {
      profile_id: string; full_name: string | null; email: string | null;
      phone: string | null; account_status: string; is_staff: boolean;
      stores_count: number; created_at: string; last_seen_at: string | null;
      total_count: number;
    }[];
  };
  set_account_status: {
    args: { p_profile_id: string; p_status: string; p_reason?: string | null };
    returns: void;
  };
  audit_log_page: {
    args: { p_action?: string | null; p_resource?: string | null;
            p_actor?: string | null; p_limit?: number; p_offset?: number };
    returns: {
      log_id: string; created_at: string; actor_id: string | null;
      actor_name: string | null; actor_kind: string; action: string;
      resource_type: string | null; resource_id: string | null;
      store_id: string | null; store_name: string | null;
      before: Json; after: Json; total_count: number;
    }[];
  };
  system_health: {
    args: Record<string, never>;
    returns: SystemHealth;
  };
  platform_reports: {
    args: { p_days?: number };
    returns: PlatformReports;
  };
  partner_admin_list: {
    args: { p_status?: string | null; p_search?: string | null;
            p_limit?: number; p_offset?: number };
    returns: {
      partner_id: string; name: string; email: string; phone: string | null;
      status: string; referral_code: string; commission_rate: number;
      is_linked: boolean; referrals_count: number; stores_active: number;
      payable: number; paid: number; created_at: string; total_count: number;
    }[];
  };
  invite_partner: {
    args: { p_name: string; p_email: string; p_phone?: string | null };
    returns: { partner_id: string; referral_code: string; token: string }[];
  };
  accept_partner_invitation: {
    args: { p_token: string };
    returns: { partner_id: string; name: string; referral_code: string }[];
  };
  set_partner_status: {
    args: { p_partner_id: string; p_status: string };
    returns: void;
  };
  set_partner_rate: {
    args: { p_partner_id: string; p_rate: number };
    returns: void;
  };
  support_queue: {
    args: { p_status?: string | null; p_mine?: boolean;
            p_search?: string | null; p_limit?: number; p_offset?: number };
    returns: {
      ticket_id: string; ticket_number: string; subject: string;
      category: string; status: string; priority: string;
      requester_name: string | null; store_name: string | null;
      assigned_to: string | null; assigned_name: string | null;
      last_message_at: string; created_at: string; total_count: number;
    }[];
  };
  support_ticket_admin: {
    args: { p_ticket_id: string };
    returns: AdminTicket;
  };
  set_ticket_status: {
    args: { p_ticket_id: string; p_status: string | null;
            p_priority?: string | null };
    returns: void;
  };
  assign_ticket: {
    args: { p_ticket_id: string; p_member_id?: string | null };
    returns: void;
  };
  add_internal_note: {
    args: { p_ticket_id: string; p_body: string };
    returns: string;
  };
  assignable_admins: {
    args: Record<string, never>;
    returns: { member_id: string; display_name: string }[];
  };
  upsert_admin_member: {
    args: { p_profile_id: string; p_display_name: string;
            p_is_owner?: boolean; p_permissions?: Record<string, string> };
    returns: string;
  };
  suspend_admin_member: {
    args: { p_member_id: string };
    returns: void;
  };
  product_costs: {
    args: { p_store_id: string };
    returns: { product_id: string; cost_price: number | null }[];
  };
  store_operational_settings: {
    args: { p_store_id: string };
    returns: {
      low_stock_threshold: number | null;
      auto_hide_out_of_stock: boolean | null;
      order_prefix: string | null;
      notification_prefs: Json;
      maintenance_mode: boolean | null;
    }[];
  };
  legal_document: {
    args: { p_slug: string };
    returns: {
      slug: string; title: string; body: string | null; updated_at: string;
    }[];
  };
  request_refund: {
    args: { p_payment_id: string; p_amount: number; p_reason: string;
            p_idempotency_key?: string | null };
    returns: { refund_id: string; amount: number; status: string }[];
  };
  review_refund: {
    args: { p_refund_id: string; p_action: string; p_reason?: string | null };
    returns: { status: string };
  };
  complete_refund: {
    args: { p_refund_id: string; p_reference?: string | null };
    returns: { status: string; commission_reversal?: string | null;
               already?: boolean };
  };
  refunds_page: {
    args: { p_status?: string | null; p_limit?: number; p_offset?: number };
    returns: {
      refund_id: string; payment_id: string; store_id: string | null;
      store_name: string | null; order_number: string | null;
      kind: string | null; amount: number; reason: string; status: string;
      initiated_by: string | null; requested_by: string | null;
      approved_by: string | null; created_at: string; total_count: number;
    }[];
  };
  claim_pending_domains: {
    args: { p_limit?: number };
    returns: {
      domain_id: string; store_id: string; hostname: string;
      attempts_age: string;
    }[];
  };
  notify_domain_verified: {
    args: { p_domain_id: string };
    returns: boolean;
  };
  record_health_check: {
    args: { p_component: string; p_status: string;
            p_latency_ms?: number | null; p_detail?: string | null };
    returns: string;
  };
  store_analytics: {
    args: { p_store_id: string; p_days?: number };
    returns: StoreAnalytics;
  };
  admin_access_matrix: {
    args: Record<string, never>;
    returns: {
      member_id: string; profile_id: string; display_name: string;
      is_owner: boolean; status: string; mfa_required: boolean;
      last_active_at: string | null;
      permissions: Record<string, string>;
    }[];
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
  //
  // ★★ التحويل على **العميل** لا على التابع. كان السطر:
  //       const call = client.rpc as unknown as (…);
  //       await call(name, args);
  // وهذا ينزع التابع عن كائنه. وجسم `rpc` في supabase-js هو
  // `return this.rest.rpc(...)`، ومع وحدات ES الصارمة يصير `this`
  // غير معرَّف ⇒ TypeError قبل أن يخرج أي طلب إلى الشبكة. كل نداء
  // مرّ بهذا المساعد كان يفشل بصمت ويظهر للمستخدم «حدث خطأ غير
  // متوقع» — ولهذا لم يُنشأ متجر واحد قط.
  const { data, error } = await (client as unknown as {
    rpc: (n: string, a: unknown) =>
      Promise<{ data: unknown; error: PostgrestError | null }>;
  }).rpc(name as string, args);
  return { data: (data ?? null) as RpcMap[K]['returns'] | null, error };
}

/** أول صف من نتيجة دالة تعيد جدولًا. */
export function firstRow<T>(data: T[] | null | undefined): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : null;
}
