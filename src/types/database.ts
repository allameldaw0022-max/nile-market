// ملف مولَّد آليًا من مخطط Supabase — لا يُحرَّر يدويًا.
// إعادة التوليد: npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          execute_after: string
          executed_at: string | null
          id: string
          profile_id: string
          requested_at: string
        }
        Insert: {
          cancelled_at?: string | null
          execute_after: string
          executed_at?: string | null
          id?: string
          profile_id: string
          requested_at?: string
        }
        Update: {
          cancelled_at?: string | null
          execute_after?: string
          executed_at?: string | null
          id?: string
          profile_id?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_members: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          is_owner: boolean
          last_active_at: string | null
          mfa_required: boolean
          profile_id: string
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          is_owner?: boolean
          last_active_at?: string | null
          mfa_required?: boolean
          profile_id: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          is_owner?: boolean
          last_active_at?: string | null
          mfa_required?: boolean
          profile_id?: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permissions: {
        Row: {
          admin_member_id: string
          created_at: string
          id: string
          level: Database["public"]["Enums"]["admin_level"]
          section: Database["public"]["Enums"]["admin_section"]
          updated_at: string
        }
        Insert: {
          admin_member_id: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["admin_level"]
          section: Database["public"]["Enums"]["admin_section"]
          updated_at?: string
        }
        Update: {
          admin_member_id?: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["admin_level"]
          section?: Database["public"]["Enums"]["admin_section"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_admin_member_id_fkey"
            columns: ["admin_member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          conversion_rate: number | null
          date: string
          id: string
          new_customers: number
          orders_count: number
          orders_revenue: number
          products_sold: number
          store_id: string
          unique_visitors: number
          visits: number
        }
        Insert: {
          conversion_rate?: number | null
          date: string
          id?: string
          new_customers?: number
          orders_count?: number
          orders_revenue?: number
          products_sold?: number
          store_id: string
          unique_visitors?: number
          visits?: number
        }
        Update: {
          conversion_rate?: number | null
          date?: string
          id?: string
          new_customers?: number
          orders_count?: number
          orders_revenue?: number
          products_sold?: number
          store_id?: string
          unique_visitors?: number
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          ip_hash: string | null
          resource_id: string | null
          resource_type: string | null
          store_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          resource_id?: string | null
          resource_type?: string | null
          store_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          resource_id?: string | null
          resource_type?: string | null
          store_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string
          cart_id: string
          id: string
          product_id: string
          quantity: number
          store_id: string
          variant_id: string | null
        }
        Insert: {
          added_at?: string
          cart_id: string
          id?: string
          product_id: string
          quantity: number
          store_id: string
          variant_id?: string | null
        }
        Update: {
          added_at?: string
          cart_id?: string
          id?: string
          product_id?: string
          quantity?: number
          store_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          anon_token: string | null
          created_at: string
          expires_at: string
          id: string
          profile_id: string | null
          status: Database["public"]["Enums"]["cart_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          anon_token?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          profile_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          anon_token?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          profile_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          image_id: string | null
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_ledger: {
        Row: {
          amount: number
          base_amount: number
          created_at: string
          currency: string
          entry_kind: Database["public"]["Enums"]["commission_entry_kind"]
          id: string
          partner_id: string
          payment_id: string | null
          payout_id: string | null
          rate_applied: number
          referral_id: string | null
          refund_id: string | null
          reverses_id: string | null
          status: Database["public"]["Enums"]["commission_status"]
          store_id: string
          subscription_id: string | null
        }
        Insert: {
          amount: number
          base_amount: number
          created_at?: string
          currency?: string
          entry_kind?: Database["public"]["Enums"]["commission_entry_kind"]
          id?: string
          partner_id: string
          payment_id?: string | null
          payout_id?: string | null
          rate_applied: number
          referral_id?: string | null
          refund_id?: string | null
          reverses_id?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          store_id: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          base_amount?: number
          created_at?: string
          currency?: string
          entry_kind?: Database["public"]["Enums"]["commission_entry_kind"]
          id?: string
          partner_id?: string
          payment_id?: string | null
          payout_id?: string | null
          rate_applied?: number
          referral_id?: string | null
          refund_id?: string | null
          reverses_id?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          store_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_balances"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commission_ledger_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          customer_id: string | null
          discount_amount: number
          id: string
          order_id: string
          store_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          customer_id?: string | null
          discount_amount: number
          id?: string
          order_id: string
          store_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          order_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to: Json
          code: string
          created_at: string
          deleted_at: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount_amount: number | null
          min_order_amount: number | null
          starts_at: string | null
          store_id: string
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_limit_per_customer: number | null
          usage_limit_total: number | null
          used_count: number
          value: number
        }
        Insert: {
          applies_to?: Json
          code: string
          created_at?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number | null
          starts_at?: string | null
          store_id: string
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          used_count?: number
          value: number
        }
        Update: {
          applies_to?: Json
          code?: string
          created_at?: string
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number | null
          starts_at?: string | null
          store_id?: string
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          id: string
          is_default: boolean
          label: string | null
          landmark: string | null
          phone: string
          recipient_name: string
          store_id: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address_line: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          phone: string
          recipient_name: string
          store_id: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address_line?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          phone?: string
          recipient_name?: string
          store_id?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          anonymized_at: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_order_at: string | null
          id: string
          last_order_at: string | null
          marketing_consent: boolean
          name: string | null
          notes: string | null
          orders_count: number
          phone: string | null
          profile_id: string | null
          store_id: string
          total_spent: number
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_order_at?: string | null
          id?: string
          last_order_at?: string | null
          marketing_consent?: boolean
          name?: string | null
          notes?: string | null
          orders_count?: number
          phone?: string | null
          profile_id?: string | null
          store_id: string
          total_spent?: number
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_order_at?: string | null
          id?: string
          last_order_at?: string | null
          marketing_consent?: boolean
          name?: string | null
          notes?: string | null
          orders_count?: number
          phone?: string | null
          profile_id?: string | null
          store_id?: string
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          created_at: string
          deleted_at: string | null
          est_days_max: number | null
          est_days_min: number | null
          fee: number
          id: string
          is_active: boolean
          min_order_free: number | null
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          est_days_max?: number | null
          est_days_min?: number | null
          fee?: number
          id?: string
          is_active?: boolean
          min_order_free?: number | null
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          est_days_max?: number | null
          est_days_min?: number | null
          fee?: number
          id?: string
          is_active?: boolean
          min_order_free?: number | null
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
          payload: Json
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          template: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          template: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          template?: string
          to_email?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          rollout: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          rollout?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          rollout?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          key: string
          request_hash: string | null
          response: Json | null
          scope: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          key: string
          request_hash?: string | null
          response?: Json | null
          scope: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          key?: string
          request_hash?: string | null
          response?: Json | null
          scope?: string
          status?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          low_stock_threshold: number | null
          product_id: string
          quantity: number
          reserved: number
          store_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          id?: string
          low_stock_threshold?: number | null
          product_id: string
          quantity?: number
          reserved?: number
          store_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          id?: string
          low_stock_threshold?: number | null
          product_id?: string
          quantity?: number
          reserved?: number
          store_id?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          delta: number
          id: string
          note: string | null
          order_id: string | null
          product_id: string
          reason: Database["public"]["Enums"]["inventory_reason"]
          store_id: string
          variant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delta: number
          id?: string
          note?: string | null
          order_id?: string | null
          product_id: string
          reason: Database["public"]["Enums"]["inventory_reason"]
          store_id: string
          variant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          note?: string | null
          order_id?: string | null
          product_id?: string
          reason?: Database["public"]["Enums"]["inventory_reason"]
          store_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          order_id: string | null
          payment_id: string | null
          snapshot: Json
          store_id: string | null
          subscription_id: string | null
          total: number
        }
        Insert: {
          currency?: string
          id?: string
          invoice_number: string
          issued_at?: string
          order_id?: string | null
          payment_id?: string | null
          snapshot: Json
          store_id?: string | null
          subscription_id?: string | null
          total: number
        }
        Update: {
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id?: string | null
          payment_id?: string | null
          snapshot?: Json
          store_id?: string | null
          subscription_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string | null
          account_kind: Database["public"]["Enums"]["ledger_account"]
          amount: number
          commission_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          memo: string | null
          payment_id: string | null
          payout_id: string | null
          refund_id: string | null
          reverses_entry_id: string | null
          subscription_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_kind: Database["public"]["Enums"]["ledger_account"]
          amount: number
          commission_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          memo?: string | null
          payment_id?: string | null
          payout_id?: string | null
          refund_id?: string | null
          reverses_entry_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_kind?: Database["public"]["Enums"]["ledger_account"]
          amount?: number
          commission_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: Database["public"]["Enums"]["ledger_direction"]
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          memo?: string | null
          payment_id?: string | null
          payout_id?: string | null
          refund_id?: string | null
          reverses_entry_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_commission_fk"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_payout_fk"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      media_files: {
        Row: {
          blur_data_url: string | null
          bucket: string
          checksum: string | null
          created_at: string
          deleted_at: string | null
          height: number | null
          id: string
          mime_type: string
          owner_profile_id: string | null
          path: string
          purpose: Database["public"]["Enums"]["media_purpose"]
          size_bytes: number
          status: Database["public"]["Enums"]["media_status"]
          store_id: string | null
          variants: Json
          width: number | null
        }
        Insert: {
          blur_data_url?: string | null
          bucket: string
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          height?: number | null
          id?: string
          mime_type: string
          owner_profile_id?: string | null
          path: string
          purpose: Database["public"]["Enums"]["media_purpose"]
          size_bytes: number
          status?: Database["public"]["Enums"]["media_status"]
          store_id?: string | null
          variants?: Json
          width?: number | null
        }
        Update: {
          blur_data_url?: string | null
          bucket?: string
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          height?: number | null
          id?: string
          mime_type?: string
          owner_profile_id?: string | null
          path?: string
          purpose?: Database["public"]["Enums"]["media_purpose"]
          size_bytes?: number
          status?: Database["public"]["Enums"]["media_status"]
          store_id?: string | null
          variants?: Json
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_files_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_files_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          dedupe_key: string | null
          id: string
          link: string | null
          read_at: string | null
          store_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          store_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          store_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          store_id: string
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sku?: string | null
          store_id: string
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          store_id?: string
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          reason: string | null
          store_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          reason?: string | null
          store_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          reason?: string | null
          store_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          completed_at: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          delivery_address: Json
          delivery_fee: number
          delivery_zone_id: string | null
          delivery_zone_name: string | null
          discount_total: number
          guest_token: string | null
          id: string
          idempotency_key: string
          internal_note: string | null
          note: string | null
          order_number: string
          paid_total: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          placed_via: Database["public"]["Enums"]["order_channel"]
          refunded_total: number
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivery_address?: Json
          delivery_fee?: number
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          discount_total?: number
          guest_token?: string | null
          id?: string
          idempotency_key: string
          internal_note?: string | null
          note?: string | null
          order_number: string
          paid_total?: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          placed_via?: Database["public"]["Enums"]["order_channel"]
          refunded_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivery_address?: Json
          delivery_fee?: number
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          discount_total?: number
          guest_token?: string | null
          id?: string
          idempotency_key?: string
          internal_note?: string | null
          note?: string | null
          order_number?: string
          paid_total?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          placed_via?: Database["public"]["Enums"]["order_channel"]
          refunded_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          initiated_by: string | null
          initiated_by_kind: Database["public"]["Enums"]["actor_kind"] | null
          method: string | null
          note: string | null
          paid_at: string | null
          partner_id: string
          reference: string | null
          rejected_reason: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key: string
          initiated_by?: string | null
          initiated_by_kind?: Database["public"]["Enums"]["actor_kind"] | null
          method?: string | null
          note?: string | null
          paid_at?: string | null
          partner_id: string
          reference?: string | null
          rejected_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          initiated_by?: string | null
          initiated_by_kind?: Database["public"]["Enums"]["actor_kind"] | null
          method?: string | null
          note?: string | null
          paid_at?: string | null
          partner_id?: string
          reference?: string | null
          rejected_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_balances"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          commission_rate: number
          created_at: string
          created_by: string | null
          email: string
          id: string
          invite_token_hash: string | null
          invited_at: string | null
          name: string
          payout_notes: string | null
          phone: string | null
          profile_id: string | null
          referral_code: string
          status: Database["public"]["Enums"]["partner_status"]
          updated_at: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          invite_token_hash?: string | null
          invited_at?: string | null
          name: string
          payout_notes?: string | null
          phone?: string | null
          profile_id?: string | null
          referral_code: string
          status?: Database["public"]["Enums"]["partner_status"]
          updated_at?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          invite_token_hash?: string | null
          invited_at?: string | null
          name?: string
          payout_notes?: string | null
          phone?: string | null
          profile_id?: string | null
          referral_code?: string
          status?: Database["public"]["Enums"]["partner_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          from_status: Database["public"]["Enums"]["payment_status"] | null
          id: string
          metadata: Json
          payment_id: string
          to_status: Database["public"]["Enums"]["payment_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          from_status?: Database["public"]["Enums"]["payment_status"] | null
          id?: string
          metadata?: Json
          payment_id: string
          to_status?: Database["public"]["Enums"]["payment_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          from_status?: Database["public"]["Enums"]["payment_status"] | null
          id?: string
          metadata?: Json
          payment_id?: string
          to_status?: Database["public"]["Enums"]["payment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          external_event_id: string | null
          failed_reason: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string | null
          paid_at: string | null
          proof_media_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          store_id: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          external_event_id?: string | null
          failed_reason?: string | null
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          order_id?: string | null
          paid_at?: string | null
          proof_media_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          external_event_id?: string | null
          failed_reason?: string | null
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string | null
          paid_at?: string | null
          proof_media_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_proof_media_id_fkey"
            columns: ["proof_media_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          bool_value: boolean | null
          configured_at: string | null
          created_at: string
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bool_value?: boolean | null
          configured_at?: string | null
          created_at?: string
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bool_value?: boolean | null
          configured_at?: string | null
          created_at?: string
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entitlements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: Database["public"]["Enums"]["billing_period"]
          code: string
          created_at: string
          currency: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          is_free: boolean
          is_public: boolean
          name: string
          price: number
          price_configured_at: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_period?: Database["public"]["Enums"]["billing_period"]
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          is_free?: boolean
          is_public?: boolean
          name: string
          price?: number
          price_configured_at?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_period?: Database["public"]["Enums"]["billing_period"]
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          is_free?: boolean
          is_public?: boolean
          name?: string
          price?: number
          price_configured_at?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          auto_renew_enabled: boolean
          bank_accounts: Json
          bankak_number: string | null
          commercial_launch_enabled: boolean
          default_partner_rate: number
          expiring_warning_days: number
          grace_period_days: number
          id: boolean
          legal: Json
          maintenance_message: string | null
          maintenance_mode: boolean
          min_payout_amount: number | null
          payment_instructions: string | null
          retention_days_personal: number
          retention_months_tickets: number
          slug_reservation_months: number
          sod_enabled: Json
          support_email: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_renew_enabled?: boolean
          bank_accounts?: Json
          bankak_number?: string | null
          commercial_launch_enabled?: boolean
          default_partner_rate?: number
          expiring_warning_days?: number
          grace_period_days?: number
          id?: boolean
          legal?: Json
          maintenance_message?: string | null
          maintenance_mode?: boolean
          min_payout_amount?: number | null
          payment_instructions?: string | null
          retention_days_personal?: number
          retention_months_tickets?: number
          slug_reservation_months?: number
          sod_enabled?: Json
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_renew_enabled?: boolean
          bank_accounts?: Json
          bankak_number?: string | null
          commercial_launch_enabled?: boolean
          default_partner_rate?: number
          expiring_warning_days?: number
          grace_period_days?: number
          id?: boolean
          legal?: Json
          maintenance_message?: string | null
          maintenance_mode?: boolean
          min_payout_amount?: number | null
          payment_instructions?: string | null
          retention_days_personal?: number
          retention_months_tickets?: number
          slug_reservation_months?: number
          sod_enabled?: Json
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          media_file_id: string
          product_id: string
          sort_order: number
          store_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_file_id: string
          product_id: string
          sort_order?: number
          store_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_file_id?: string
          product_id?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_media_file_id_fkey"
            columns: ["media_file_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          compare_at_price: number | null
          created_at: string
          deleted_at: string | null
          id: string
          image_id: string | null
          is_active: boolean
          name: string
          options: Json
          price: number | null
          product_id: string
          sku: string | null
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          compare_at_price?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean
          name: string
          options?: Json
          price?: number | null
          product_id: string
          sku?: string | null
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          compare_at_price?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean
          name?: string
          options?: Json
          price?: number | null
          product_id?: string
          sku?: string | null
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          category_id: string | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          has_variants: boolean
          id: string
          name: string
          price: number
          published_at: string | null
          seo: Json
          sku: string | null
          slug: string
          sold_count: number
          status: Database["public"]["Enums"]["product_status"]
          store_id: string
          track_inventory: boolean
          updated_at: string
          views_count: number
          weight_grams: number | null
        }
        Insert: {
          attributes?: Json
          category_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          name: string
          price: number
          published_at?: string | null
          seo?: Json
          sku?: string | null
          slug: string
          sold_count?: number
          status?: Database["public"]["Enums"]["product_status"]
          store_id: string
          track_inventory?: boolean
          updated_at?: string
          views_count?: number
          weight_grams?: number | null
        }
        Update: {
          attributes?: Json
          category_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          name?: string
          price?: number
          published_at?: string | null
          seo?: Json
          sku?: string | null
          slug?: string
          sold_count?: number
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string
          track_inventory?: boolean
          updated_at?: string
          views_count?: number
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          anonymized_at: string | null
          avatar_url: string | null
          created_at: string
          email_verified_at: string | null
          full_name: string | null
          id: string
          is_platform_staff: boolean
          last_seen_at: string | null
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          anonymized_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email_verified_at?: string | null
          full_name?: string | null
          id: string
          is_platform_staff?: boolean
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          anonymized_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email_verified_at?: string | null
          full_name?: string | null
          id?: string
          is_platform_staff?: boolean
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      referral_visits: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          landing_path: string | null
          partner_id: string
          user_agent: string | null
          visitor_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          landing_path?: string | null
          partner_id: string
          user_agent?: string | null
          visitor_token: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          landing_path?: string | null
          partner_id?: string
          user_agent?: string | null
          visitor_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_balances"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "referral_visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          attributed_at: string
          attribution_source: Database["public"]["Enums"]["attribution_source"]
          created_at: string
          id: string
          locked: boolean
          partner_id: string
          store_id: string
        }
        Insert: {
          attributed_at?: string
          attribution_source?: Database["public"]["Enums"]["attribution_source"]
          created_at?: string
          id?: string
          locked?: boolean
          partner_id: string
          store_id: string
        }
        Update: {
          attributed_at?: string
          attribution_source?: Database["public"]["Enums"]["attribution_source"]
          created_at?: string
          id?: string
          locked?: boolean
          partner_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_balances"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          initiated_by: string | null
          initiated_by_kind: Database["public"]["Enums"]["actor_kind"] | null
          order_id: string | null
          payment_id: string
          reason: string
          rejected_reason: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["refund_status"]
          store_id: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          initiated_by?: string | null
          initiated_by_kind?: Database["public"]["Enums"]["actor_kind"] | null
          order_id?: string | null
          payment_id: string
          reason: string
          rejected_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          store_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          initiated_by?: string | null
          initiated_by_kind?: Database["public"]["Enums"]["actor_kind"] | null
          order_id?: string | null
          payment_id?: string
          reason?: string
          rejected_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          store_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_slugs: {
        Row: {
          created_at: string
          reason: string
          reserved_until: string | null
          slug: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          reason?: string
          reserved_until?: string | null
          slug: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          reason?: string
          reserved_until?: string | null
          slug?: string
          store_id?: string | null
        }
        Relationships: []
      }
      store_domains: {
        Row: {
          created_at: string
          failure_reason: string | null
          hostname: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["domain_kind"]
          last_checked_at: string | null
          redirect_to_primary: boolean
          redirect_www: boolean
          released_at: string | null
          status: Database["public"]["Enums"]["domain_status"]
          store_id: string
          updated_at: string
          verification_method: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          hostname: string
          id?: string
          is_primary?: boolean
          kind: Database["public"]["Enums"]["domain_kind"]
          last_checked_at?: string | null
          redirect_to_primary?: boolean
          redirect_www?: boolean
          released_at?: string | null
          status?: Database["public"]["Enums"]["domain_status"]
          store_id: string
          updated_at?: string
          verification_method?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          hostname?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["domain_kind"]
          last_checked_at?: string | null
          redirect_to_primary?: boolean
          redirect_www?: boolean
          released_at?: string | null
          status?: Database["public"]["Enums"]["domain_status"]
          store_id?: string
          updated_at?: string
          verification_method?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_domains_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          permissions: string[]
          role: Database["public"]["Enums"]["store_role"]
          store_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          permissions?: string[]
          role: Database["public"]["Enums"]["store_role"]
          store_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          permissions?: string[]
          role?: Database["public"]["Enums"]["store_role"]
          store_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_invitations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          invited_at: string
          invited_by: string | null
          permissions: string[]
          profile_id: string
          role: Database["public"]["Enums"]["store_role"]
          status: Database["public"]["Enums"]["member_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          permissions?: string[]
          profile_id: string
          role: Database["public"]["Enums"]["store_role"]
          status?: Database["public"]["Enums"]["member_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          permissions?: string[]
          profile_id?: string
          role?: Database["public"]["Enums"]["store_role"]
          status?: Database["public"]["Enums"]["member_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_sequences: {
        Row: {
          next_number: number
          store_id: string
        }
        Insert: {
          next_number?: number
          store_id: string
        }
        Update: {
          next_number?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_sequences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_payment_settings: {
        Row: {
          bank_accounts: Json
          bankak_number: string | null
          created_at: string
          payout_notes: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          bank_accounts?: Json
          bankak_number?: string | null
          created_at?: string
          payout_notes?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          bank_accounts?: Json
          bankak_number?: string | null
          created_at?: string
          payout_notes?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_payment_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: Json
          auto_hide_out_of_stock: boolean
          bank_transfer_enabled: boolean
          bankak_enabled: boolean
          cod_enabled: boolean
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          low_stock_threshold: number
          maintenance_mode: boolean
          notification_prefs: Json
          order_prefix: string | null
          policies: Json
          seo: Json
          social_links: Json
          store_id: string
          theme: Json
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          address?: Json
          auto_hide_out_of_stock?: boolean
          bank_transfer_enabled?: boolean
          bankak_enabled?: boolean
          cod_enabled?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          low_stock_threshold?: number
          maintenance_mode?: boolean
          notification_prefs?: Json
          order_prefix?: string | null
          policies?: Json
          seo?: Json
          social_links?: Json
          store_id: string
          theme?: Json
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          address?: Json
          auto_hide_out_of_stock?: boolean
          bank_transfer_enabled?: boolean
          bankak_enabled?: boolean
          cod_enabled?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          low_stock_threshold?: number
          maintenance_mode?: boolean
          notification_prefs?: Json
          order_prefix?: string | null
          policies?: Json
          seo?: Json
          social_links?: Json
          store_id?: string
          theme?: Json
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_visits: {
        Row: {
          created_at: string
          id: string
          path: string | null
          store_id: string
          visitor_token: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          path?: string | null
          store_id: string
          visitor_token?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          path?: string | null
          store_id?: string
          visitor_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          banner_url: string | null
          business_type: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          onboarding_step: string
          owner_id: string
          published_at: string | null
          referred_by_partner_id: string | null
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          business_type?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_step?: string
          owner_id: string
          published_at?: string | null
          referred_by_partner_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          business_type?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?: string
          owner_id?: string
          published_at?: string | null
          referred_by_partner_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_partner_fk"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_balances"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "stores_partner_fk"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: Database["public"]["Enums"]["subscription_event_kind"]
          from_plan_id: string | null
          id: string
          metadata: Json
          payment_id: string | null
          store_id: string
          subscription_id: string
          to_plan_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: Database["public"]["Enums"]["subscription_event_kind"]
          from_plan_id?: string | null
          id?: string
          metadata?: Json
          payment_id?: string | null
          store_id: string
          subscription_id: string
          to_plan_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: Database["public"]["Enums"]["subscription_event_kind"]
          from_plan_id?: string | null
          id?: string
          metadata?: Json
          payment_id?: string | null
          store_id?: string
          subscription_id?: string
          to_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_from_plan_id_fkey"
            columns: ["from_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_payment_fk"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_to_plan_id_fkey"
            columns: ["to_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_requests: {
        Row: {
          amount: number
          coupon_code: string | null
          created_at: string
          discount_amount: number
          id: string
          idempotency_key: string
          net_amount: number
          plan_id: string
          proof_media_id: string | null
          reference: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          idempotency_key: string
          net_amount: number
          plan_id: string
          proof_media_id?: string | null
          reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          idempotency_key?: string
          net_amount?: number
          plan_id?: string
          proof_media_id?: string | null
          reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_proof_media_id_fkey"
            columns: ["proof_media_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          cancel_requested_at: string | null
          created_at: string
          current_period_end: string | null
          expiring_warned_at: string | null
          grace_ends_at: string | null
          id: string
          plan_id: string
          previous_plan_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          cancel_requested_at?: string | null
          created_at?: string
          current_period_end?: string | null
          expiring_warned_at?: string | null
          grace_ends_at?: string | null
          id?: string
          plan_id: string
          previous_plan_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          cancel_requested_at?: string | null
          created_at?: string
          current_period_end?: string | null
          expiring_warned_at?: string | null
          grace_ends_at?: string | null
          id?: string
          plan_id?: string
          previous_plan_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_previous_plan_id_fkey"
            columns: ["previous_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      support_attachments: {
        Row: {
          created_at: string
          id: string
          media_file_id: string
          message_id: string | null
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          media_file_id: string
          message_id?: string | null
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          media_file_id?: string
          message_id?: string | null
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_media_file_id_fkey"
            columns: ["media_file_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          from_value: string | null
          id: string
          ticket_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          from_value?: string | null
          id?: string
          ticket_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          from_value?: string | null
          id?: string
          ticket_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_internal_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_internal_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_internal_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author_id: string | null
          author_kind: Database["public"]["Enums"]["message_author_kind"]
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_kind: Database["public"]["Enums"]["message_author_kind"]
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_kind?: Database["public"]["Enums"]["message_author_kind"]
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          closed_at: string | null
          created_at: string
          first_response_at: string | null
          id: string
          last_message_at: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          related_order_id: string | null
          related_payment_id: string | null
          related_subscription_id: string | null
          reopened_count: number
          requester_id: string
          requester_kind: Database["public"]["Enums"]["requester_kind"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          store_id: string | null
          subject: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          related_order_id?: string | null
          related_payment_id?: string | null
          related_subscription_id?: string | null
          reopened_count?: number
          requester_id: string
          requester_kind: Database["public"]["Enums"]["requester_kind"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          store_id?: string | null
          subject: string
          ticket_number: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          related_order_id?: string | null
          related_payment_id?: string | null
          related_subscription_id?: string | null
          reopened_count?: number
          requester_id?: string
          requester_kind?: Database["public"]["Enums"]["requester_kind"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          store_id?: string | null
          subject?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_related_payment_id_fkey"
            columns: ["related_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_related_subscription_id_fkey"
            columns: ["related_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_checks: {
        Row: {
          checked_at: string
          component: string
          detail: string | null
          id: string
          latency_ms: number | null
          status: Database["public"]["Enums"]["health_status"]
        }
        Insert: {
          checked_at?: string
          component: string
          detail?: string | null
          id?: string
          latency_ms?: number | null
          status: Database["public"]["Enums"]["health_status"]
        }
        Update: {
          checked_at?: string
          component?: string
          detail?: string | null
          id?: string
          latency_ms?: number | null
          status?: Database["public"]["Enums"]["health_status"]
        }
        Relationships: []
      }
      user_sessions_meta: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          ip_hash: string | null
          last_active_at: string
          revoked_at: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          ip_hash?: string | null
          last_active_at?: string
          revoked_at?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          ip_hash?: string | null
          last_active_at?: string
          revoked_at?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_meta_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          profile_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          profile_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          profile_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ledger_balances: {
        Row: {
          account_id: string | null
          account_kind: Database["public"]["Enums"]["ledger_account"] | null
          balance: number | null
          currency: string | null
        }
        Relationships: []
      }
      partner_balances: {
        Row: {
          paid: number | null
          partner_id: string | null
          payable: number | null
          total: number | null
        }
        Relationships: []
      }
      store_team: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          profile_id: string | null
          role: Database["public"]["Enums"]["store_role"] | null
          status: Database["public"]["Enums"]["member_status"] | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_partner_invitation: {
        Args: { p_token: string }
        Returns: {
          name: string
          partner_id: string
          referral_code: string
        }[]
      }
      accept_store_invitation: {
        Args: { p_token: string }
        Returns: {
          role: Database["public"]["Enums"]["store_role"]
          store_id: string
        }[]
      }
      add_custom_domain: {
        Args: { p_hostname: string; p_store_id: string }
        Returns: {
          domain_id: string
          verification_token: string
        }[]
      }
      add_internal_note: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: string
      }
      adjust_inventory: {
        Args: {
          p_delta: number
          p_note?: string
          p_product_id: string
          p_reason?: string
          p_store_id: string
          p_variant_id?: string
        }
        Returns: {
          quantity: number
        }[]
      }
      admin_access_matrix: {
        Args: never
        Returns: {
          display_name: string
          is_owner: boolean
          last_active_at: string
          member_id: string
          mfa_required: boolean
          permissions: Json
          profile_id: string
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      admin_overview: { Args: never; Returns: Json }
      aggregate_analytics: { Args: { p_date?: string }; Returns: number }
      anonymize_due_accounts: { Args: never; Returns: number }
      assign_ticket: {
        Args: { p_member_id?: string; p_ticket_id: string }
        Returns: undefined
      }
      assignable_admins: {
        Args: never
        Returns: {
          display_name: string
          member_id: string
        }[]
      }
      audit_log_page: {
        Args: {
          p_action?: string
          p_actor?: string
          p_limit?: number
          p_offset?: number
          p_resource?: string
        }
        Returns: {
          action: string
          actor_id: string
          actor_kind: string
          actor_name: string
          after: Json
          before: Json
          created_at: string
          log_id: string
          resource_id: string
          resource_type: string
          store_id: string
          store_name: string
          total_count: number
        }[]
      }
      cancel_subscription_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      cart_add_item: {
        Args: {
          p_anon_token?: string
          p_product_id: string
          p_quantity?: number
          p_store_id: string
          p_variant_id?: string
        }
        Returns: {
          cart_id: string
          quantity: number
        }[]
      }
      cart_merge_guest: {
        Args: { p_anon_token: string; p_store_id: string }
        Returns: {
          cart_id: string
          merged: number
        }[]
      }
      cart_set_quantity: {
        Args: {
          p_anon_token?: string
          p_item_id: string
          p_quantity: number
          p_store_id: string
        }
        Returns: undefined
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_emails: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          id: string
          payload: Json
          template: string
          to_email: string
        }[]
      }
      claim_pending_domains: {
        Args: { p_limit?: number }
        Returns: {
          attempts_age: string
          domain_id: string
          hostname: string
          store_id: string
        }[]
      }
      close_my_ticket: { Args: { p_ticket_id: string }; Returns: undefined }
      complete_refund: {
        Args: { p_reference?: string; p_refund_id: string }
        Returns: Json
      }
      create_order: {
        Args: {
          p_address: Json
          p_cart_id?: string
          p_contact: Json
          p_coupon_code?: string
          p_idempotency_key?: string
          p_items: Json
          p_note?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_store_id: string
          p_zone_id: string
        }
        Returns: {
          guest_token: string
          order_id: string
          order_number: string
          total: number
        }[]
      }
      create_store: {
        Args: {
          p_business_type?: string
          p_name: string
          p_slug: string
          p_visitor_token?: string
        }
        Returns: {
          slug: string
          store_id: string
        }[]
      }
      create_support_ticket: {
        Args: {
          p_body: string
          p_category: Database["public"]["Enums"]["ticket_category"]
          p_requester_kind?: Database["public"]["Enums"]["requester_kind"]
          p_store_id?: string
          p_subject: string
        }
        Returns: {
          ticket_id: string
          ticket_number: string
        }[]
      }
      delete_product: { Args: { p_product_id: string }; Returns: undefined }
      duplicate_product: {
        Args: { p_product_id: string }
        Returns: {
          product_id: string
          slug: string
        }[]
      }
      finalize_upload: {
        Args: {
          p_blur?: string
          p_height?: number
          p_media_id: string
          p_width?: number
        }
        Returns: undefined
      }
      get_cart: {
        Args: { p_anon_token?: string; p_store_id: string }
        Returns: {
          available: number
          cart_id: string
          image_bucket: string
          image_path: string
          item_id: string
          line_total: number
          product_id: string
          product_name: string
          product_slug: string
          quantity: number
          unit_price: number
          variant_id: string
          variant_name: string
        }[]
      }
      import_products: {
        Args: { p_dry_run?: boolean; p_rows: Json; p_store_id: string }
        Returns: {
          errors: Json
          failed: number
          imported: number
        }[]
      }
      invite_partner: {
        Args: { p_email: string; p_name: string; p_phone?: string }
        Returns: {
          partner_id: string
          referral_code: string
          token: string
        }[]
      }
      invite_store_member: {
        Args: {
          p_email: string
          p_permissions?: string[]
          p_role: Database["public"]["Enums"]["store_role"]
          p_store_id: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      is_slug_available: {
        Args: { p_slug: string; p_store_id?: string }
        Returns: boolean
      }
      legal_document: {
        Args: { p_slug: string }
        Returns: {
          body: string
          slug: string
          title: string
          updated_at: string
        }[]
      }
      mark_email_failed: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      mark_email_sent: { Args: { p_id: string }; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_payout_paid: {
        Args: { p_payout_id: string; p_reference?: string }
        Returns: number
      }
      my_orders: {
        Args: { p_store_id: string }
        Returns: {
          created_at: string
          item_count: number
          order_id: string
          order_number: string
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      notify_domain_verified: {
        Args: { p_domain_id: string }
        Returns: boolean
      }
      order_details: {
        Args: {
          p_guest_token?: string
          p_order_number: string
          p_phone?: string
          p_store_id: string
        }
        Returns: {
          contact_name: string
          contact_phone: string
          coupon_code: string
          created_at: string
          delivery_address: Json
          delivery_fee: number
          delivery_zone_name: string
          discount_total: number
          items: Json
          note: string
          order_id: string
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
        }[]
      }
      order_payment_instructions: {
        Args: {
          p_guest_token?: string
          p_order_number: string
          p_phone?: string
          p_store_id: string
        }
        Returns: {
          amount_due: number
          bank_accounts: Json
          bankak_number: string
        }[]
      }
      partner_admin_list: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          commission_rate: number
          created_at: string
          email: string
          is_linked: boolean
          name: string
          paid: number
          partner_id: string
          payable: number
          phone: string
          referral_code: string
          referrals_count: number
          status: string
          stores_active: number
          total_count: number
        }[]
      }
      payments_page: {
        Args: {
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          amount: number
          created_at: string
          kind: string
          method: string
          order_number: string
          paid_at: string
          payment_id: string
          reference: string
          status: string
          store_id: string
          store_name: string
          total_count: number
        }[]
      }
      plan_configuration_status: {
        Args: never
        Returns: {
          active_admins: number
          admins_sufficient: boolean
          complete: boolean
          unconfigured_features: string[]
          unconfigured_prices: string[]
        }[]
      }
      platform_payment_info: {
        Args: never
        Returns: {
          bank_accounts: Json
          bankak_number: string
          payment_instructions: string
        }[]
      }
      platform_reports: { Args: { p_days?: number }; Returns: Json }
      platform_users: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          account_status: string
          created_at: string
          email: string
          full_name: string
          is_staff: boolean
          last_seen_at: string
          phone: string
          profile_id: string
          stores_count: number
          total_count: number
        }[]
      }
      prepare_upload: {
        Args: {
          p_ext?: string
          p_mime: string
          p_purpose: Database["public"]["Enums"]["media_purpose"]
          p_size: number
          p_store_id: string
        }
        Returns: {
          bucket: string
          media_id: string
          path: string
        }[]
      }
      publish_store: {
        Args: { p_store_id: string }
        Returns: {
          missing: string[]
          ok: boolean
        }[]
      }
      purge_old_tickets: { Args: never; Returns: number }
      quote_checkout: {
        Args: {
          p_anon_token?: string
          p_coupon_code?: string
          p_store_id: string
          p_zone_id?: string
        }
        Returns: {
          can_checkout: boolean
          coupon_message: string
          coupon_valid: boolean
          delivery_fee: number
          discount_total: number
          item_count: number
          out_of_stock: boolean
          subtotal: number
          total: number
        }[]
      }
      record_health_check: {
        Args: {
          p_component: string
          p_detail?: string
          p_latency_ms?: number
          p_status: Database["public"]["Enums"]["health_status"]
        }
        Returns: string
      }
      record_payment: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_kind: Database["public"]["Enums"]["payment_kind"]
          p_method: Database["public"]["Enums"]["payment_method"]
          p_proof_media_id?: string
          p_reference?: string
          p_target_id: string
        }
        Returns: string
      }
      record_referral_visit: {
        Args: {
          p_code: string
          p_ip?: string
          p_landing_path?: string
          p_user_agent?: string
          p_visitor_token: string
        }
        Returns: boolean
      }
      refunds_page: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: {
          amount: number
          approved_by: string
          created_at: string
          initiated_by: string
          kind: string
          order_number: string
          payment_id: string
          reason: string
          refund_id: string
          requested_by: string
          status: string
          store_id: string
          store_name: string
          total_count: number
        }[]
      }
      release_expired_slugs: { Args: never; Returns: number }
      remove_custom_domain: {
        Args: { p_domain_id: string }
        Returns: undefined
      }
      remove_store_member: { Args: { p_member_id: string }; Returns: undefined }
      reply_to_ticket: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: undefined
      }
      request_partner_payout: {
        Args: { p_amount: number; p_idempotency_key?: string; p_note?: string }
        Returns: {
          amount: number
          payout_id: string
        }[]
      }
      request_refund: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_payment_id: string
          p_reason: string
        }
        Returns: {
          amount: number
          refund_id: string
          status: Database["public"]["Enums"]["refund_status"]
        }[]
      }
      resolve_store_by_host: {
        Args: { p_host: string }
        Returns: {
          can_checkout: boolean
          domain_status: Database["public"]["Enums"]["domain_status"]
          is_redirect: boolean
          name: string
          primary_host: string
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          store_id: string
        }[]
      }
      review_payout: {
        Args: { p_action: string; p_payout_id: string; p_reason?: string }
        Returns: Json
      }
      review_refund: {
        Args: { p_action: string; p_reason?: string; p_refund_id: string }
        Returns: Json
      }
      review_subscription_request: {
        Args: { p_action: string; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      run_daily_maintenance: { Args: never; Returns: Json }
      save_onboarding_step: {
        Args: { p_step: string; p_store_id: string }
        Returns: undefined
      }
      save_product: {
        Args: {
          p_category_id?: string
          p_compare_at_price?: number
          p_cost_price?: number
          p_description?: string
          p_image_media_ids?: string[]
          p_initial_quantity?: number
          p_low_stock_threshold?: number
          p_name: string
          p_price: number
          p_product_id?: string
          p_seo?: Json
          p_sku?: string
          p_slug?: string
          p_status?: Database["public"]["Enums"]["product_status"]
          p_store_id: string
          p_track_inventory?: boolean
          p_weight_grams?: number
        }
        Returns: {
          product_id: string
          slug: string
        }[]
      }
      set_account_status: {
        Args: {
          p_profile_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["account_status"]
        }
        Returns: undefined
      }
      set_partner_rate: {
        Args: { p_partner_id: string; p_rate: number }
        Returns: undefined
      }
      set_partner_status: {
        Args: {
          p_partner_id: string
          p_status: Database["public"]["Enums"]["partner_status"]
        }
        Returns: undefined
      }
      set_primary_domain: { Args: { p_domain_id: string }; Returns: undefined }
      set_store_member_role: {
        Args: {
          p_member_id: string
          p_permissions?: string[]
          p_role: Database["public"]["Enums"]["store_role"]
        }
        Returns: undefined
      }
      set_store_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["store_status"]
          p_store_id: string
        }
        Returns: undefined
      }
      set_ticket_status: {
        Args: {
          p_priority?: Database["public"]["Enums"]["ticket_priority"]
          p_status: Database["public"]["Enums"]["ticket_status"]
          p_ticket_id: string
        }
        Returns: undefined
      }
      store_analytics: {
        Args: { p_days?: number; p_store_id: string }
        Returns: Json
      }
      submit_subscription_request: {
        Args: {
          p_idempotency_key?: string
          p_plan_id: string
          p_proof_media_id?: string
          p_reference?: string
          p_store_id: string
        }
        Returns: {
          net_amount: number
          request_id: string
        }[]
      }
      support_queue: {
        Args: {
          p_limit?: number
          p_mine?: boolean
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          assigned_name: string
          assigned_to: string
          category: string
          created_at: string
          last_message_at: string
          priority: string
          requester_name: string
          status: string
          store_name: string
          subject: string
          ticket_id: string
          ticket_number: string
          total_count: number
        }[]
      }
      support_ticket_admin: { Args: { p_ticket_id: string }; Returns: Json }
      suspend_admin_member: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      sweep_subscriptions: {
        Args: never
        Returns: {
          expired: number
          graced: number
          warned: number
        }[]
      }
      system_health: { Args: never; Returns: Json }
      track_order: {
        Args: { p_order_number: string; p_phone: string; p_store_id: string }
        Returns: {
          created_at: string
          item_count: number
          order_id: string
          order_number: string
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      track_store_visit: {
        Args: { p_path?: string; p_store_id: string; p_visitor_token: string }
        Returns: undefined
      }
      transition_order: {
        Args: {
          p_order_id: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      upsert_admin_member: {
        Args: {
          p_display_name: string
          p_is_owner?: boolean
          p_permissions?: Json
          p_profile_id: string
        }
        Returns: string
      }
      validate_coupon: {
        Args: {
          p_code: string
          p_customer_id?: string
          p_store_id: string
          p_subtotal: number
        }
        Returns: {
          coupon_id: string
          discount: number
          message: string
          valid: boolean
        }[]
      }
      verify_domain: {
        Args: { p_domain_id: string; p_txt_records: string[] }
        Returns: {
          reason: string
          status: Database["public"]["Enums"]["domain_status"]
          verified: boolean
        }[]
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "closed"
      actor_kind: "store" | "platform" | "partner" | "customer" | "system"
      admin_level:
        | "none"
        | "view"
        | "create"
        | "edit"
        | "delete"
        | "approve"
        | "manage"
      admin_section:
        | "dashboard"
        | "merchants"
        | "stores"
        | "users"
        | "employees"
        | "orders"
        | "products"
        | "customers"
        | "plans"
        | "subscriptions"
        | "payments"
        | "commissions"
        | "partners"
        | "payouts"
        | "domains"
        | "notifications"
        | "support"
        | "reports"
        | "security"
        | "audit_logs"
        | "feature_flags"
        | "system_health"
        | "maintenance"
        | "settings"
        | "content"
      attribution_source: "link" | "code" | "admin_manual"
      billing_period: "monthly" | "yearly"
      cart_status: "active" | "converted" | "abandoned"
      commission_entry_kind: "commission" | "reversal"
      commission_status: "payable" | "paid" | "reversed"
      coupon_type: "percentage" | "fixed"
      domain_kind: "subdomain" | "custom"
      domain_status:
        | "pending"
        | "verification_required"
        | "verifying"
        | "active"
        | "ssl_pending"
        | "ssl_active"
        | "failed"
        | "suspended"
        | "removed"
      email_status: "queued" | "sending" | "sent" | "failed"
      health_status: "healthy" | "degraded" | "down"
      inventory_reason:
        | "manual_adjust"
        | "order_placed"
        | "order_cancelled"
        | "order_returned"
        | "import"
        | "correction"
        | "initial"
      job_status: "queued" | "running" | "done" | "failed"
      ledger_account: "platform" | "store" | "partner"
      ledger_direction: "credit" | "debit"
      ledger_entry_type:
        | "subscription_revenue"
        | "partner_commission"
        | "commission_reversal"
        | "partner_payout"
        | "refund"
        | "adjustment"
      media_purpose:
        | "product_image"
        | "store_logo"
        | "store_banner"
        | "category_image"
        | "payment_proof"
        | "support_attachment"
        | "import_file"
        | "export_file"
        | "avatar"
      media_status: "pending" | "ready" | "quarantined" | "deleted"
      member_status: "invited" | "active" | "suspended"
      message_author_kind: "requester" | "staff" | "system"
      order_channel: "storefront" | "whatsapp" | "dashboard"
      order_payment_status:
        | "unpaid"
        | "pending"
        | "partially_paid"
        | "paid"
        | "refunded"
        | "partially_refunded"
      order_status:
        | "new"
        | "confirmed"
        | "preparing"
        | "shipped"
        | "completed"
        | "cancelled"
      partner_status: "invited" | "active" | "suspended"
      payment_kind: "order" | "subscription"
      payment_method: "cash_on_delivery" | "bank_transfer" | "bankak"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      payout_status:
        | "submitted"
        | "pending_review"
        | "approved"
        | "rejected"
        | "paid"
      product_status: "draft" | "active" | "hidden" | "archived"
      refund_status:
        | "submitted"
        | "pending_review"
        | "approved"
        | "rejected"
        | "completed"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
      requester_kind: "merchant" | "customer" | "partner"
      store_role:
        | "owner"
        | "manager"
        | "orders"
        | "products"
        | "customer_service"
      store_status:
        | "draft"
        | "pending_review"
        | "active"
        | "closed"
        | "suspended"
      subscription_event_kind:
        | "created"
        | "activated"
        | "renewed"
        | "upgraded"
        | "downgraded"
        | "expiring_warned"
        | "entered_grace"
        | "expired"
        | "suspended"
        | "reactivated"
        | "cancelled"
      subscription_status:
        | "trialing"
        | "active"
        | "expiring"
        | "grace"
        | "expired"
        | "suspended"
        | "cancelled"
      ticket_category:
        | "technical"
        | "billing"
        | "subscription"
        | "orders"
        | "domains"
        | "account"
        | "other"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status:
        | "new"
        | "open"
        | "in_progress"
        | "waiting_customer"
        | "waiting_internal"
        | "resolved"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended", "closed"],
      actor_kind: ["store", "platform", "partner", "customer", "system"],
      admin_level: [
        "none",
        "view",
        "create",
        "edit",
        "delete",
        "approve",
        "manage",
      ],
      admin_section: [
        "dashboard",
        "merchants",
        "stores",
        "users",
        "employees",
        "orders",
        "products",
        "customers",
        "plans",
        "subscriptions",
        "payments",
        "commissions",
        "partners",
        "payouts",
        "domains",
        "notifications",
        "support",
        "reports",
        "security",
        "audit_logs",
        "feature_flags",
        "system_health",
        "maintenance",
        "settings",
        "content",
      ],
      attribution_source: ["link", "code", "admin_manual"],
      billing_period: ["monthly", "yearly"],
      cart_status: ["active", "converted", "abandoned"],
      commission_entry_kind: ["commission", "reversal"],
      commission_status: ["payable", "paid", "reversed"],
      coupon_type: ["percentage", "fixed"],
      domain_kind: ["subdomain", "custom"],
      domain_status: [
        "pending",
        "verification_required",
        "verifying",
        "active",
        "ssl_pending",
        "ssl_active",
        "failed",
        "suspended",
        "removed",
      ],
      email_status: ["queued", "sending", "sent", "failed"],
      health_status: ["healthy", "degraded", "down"],
      inventory_reason: [
        "manual_adjust",
        "order_placed",
        "order_cancelled",
        "order_returned",
        "import",
        "correction",
        "initial",
      ],
      job_status: ["queued", "running", "done", "failed"],
      ledger_account: ["platform", "store", "partner"],
      ledger_direction: ["credit", "debit"],
      ledger_entry_type: [
        "subscription_revenue",
        "partner_commission",
        "commission_reversal",
        "partner_payout",
        "refund",
        "adjustment",
      ],
      media_purpose: [
        "product_image",
        "store_logo",
        "store_banner",
        "category_image",
        "payment_proof",
        "support_attachment",
        "import_file",
        "export_file",
        "avatar",
      ],
      media_status: ["pending", "ready", "quarantined", "deleted"],
      member_status: ["invited", "active", "suspended"],
      message_author_kind: ["requester", "staff", "system"],
      order_channel: ["storefront", "whatsapp", "dashboard"],
      order_payment_status: [
        "unpaid",
        "pending",
        "partially_paid",
        "paid",
        "refunded",
        "partially_refunded",
      ],
      order_status: [
        "new",
        "confirmed",
        "preparing",
        "shipped",
        "completed",
        "cancelled",
      ],
      partner_status: ["invited", "active", "suspended"],
      payment_kind: ["order", "subscription"],
      payment_method: ["cash_on_delivery", "bank_transfer", "bankak"],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      payout_status: [
        "submitted",
        "pending_review",
        "approved",
        "rejected",
        "paid",
      ],
      product_status: ["draft", "active", "hidden", "archived"],
      refund_status: [
        "submitted",
        "pending_review",
        "approved",
        "rejected",
        "completed",
      ],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      requester_kind: ["merchant", "customer", "partner"],
      store_role: [
        "owner",
        "manager",
        "orders",
        "products",
        "customer_service",
      ],
      store_status: [
        "draft",
        "pending_review",
        "active",
        "closed",
        "suspended",
      ],
      subscription_event_kind: [
        "created",
        "activated",
        "renewed",
        "upgraded",
        "downgraded",
        "expiring_warned",
        "entered_grace",
        "expired",
        "suspended",
        "reactivated",
        "cancelled",
      ],
      subscription_status: [
        "trialing",
        "active",
        "expiring",
        "grace",
        "expired",
        "suspended",
        "cancelled",
      ],
      ticket_category: [
        "technical",
        "billing",
        "subscription",
        "orders",
        "domains",
        "account",
        "other",
      ],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: [
        "new",
        "open",
        "in_progress",
        "waiting_customer",
        "waiting_internal",
        "resolved",
        "closed",
      ],
    },
  },
} as const
