/**
 * الصلاحيات داخل المتجر.
 *
 * ★ هذا الملف نسخة مطابقة لدالة app.role_default_permissions في القاعدة.
 * القاعدة هي الجدار الحقيقي؛ هذه النسخة لتجربة الاستخدام فقط
 * (إخفاء الأزرار). يوجد اختبار تكافؤ آلي يفشل إن اختلفا.
 */
export const STORE_PERMISSIONS = [
  'products:view', 'products:create', 'products:update', 'products:delete',
  'categories:manage',
  'inventory:view', 'inventory:update',
  'orders:view', 'orders:update', 'orders:cancel', 'orders:payment',
  'customers:view', 'customers:update',
  'coupons:manage', 'promotions:manage', 'delivery:manage',
  'members:view', 'members:manage',
  'settings:view', 'settings:update', 'settings:banking',
  'domain:manage', 'subscription:manage',
  'analytics:view', 'export:data', 'audit:view', 'support:manage',
] as const;

export type StorePermission = (typeof STORE_PERMISSIONS)[number];

export type StoreRole =
  | 'owner' | 'manager' | 'orders' | 'products' | 'customer_service';

export const STORE_ROLE_PERMISSIONS: Record<StoreRole, StorePermission[]> = {
  owner: [
    'products:view', 'products:create', 'products:update', 'products:delete',
    'categories:manage', 'inventory:view', 'inventory:update',
    'orders:view', 'orders:update', 'orders:cancel', 'orders:payment',
    'customers:view', 'customers:update',
    'coupons:manage', 'promotions:manage', 'delivery:manage',
    'members:view', 'members:manage',
    'settings:view', 'settings:update', 'settings:banking',
    'domain:manage', 'subscription:manage',
    'analytics:view', 'export:data', 'audit:view', 'support:manage',
  ],
  manager: [
    'products:view', 'products:create', 'products:update', 'products:delete',
    'categories:manage', 'inventory:view', 'inventory:update',
    'orders:view', 'orders:update', 'orders:cancel', 'orders:payment',
    'customers:view', 'customers:update',
    'coupons:manage', 'promotions:manage', 'delivery:manage',
    'members:view', 'members:manage',
    'settings:view', 'settings:update',
    'analytics:view', 'export:data', 'audit:view', 'support:manage',
  ],
  orders: [
    'products:view', 'inventory:view',
    'orders:view', 'orders:update', 'orders:cancel', 'orders:payment',
    'customers:view', 'export:data',
  ],
  products: [
    'products:view', 'products:create', 'products:update',
    'categories:manage', 'inventory:view', 'inventory:update',
    'orders:view', 'export:data',
  ],
  customer_service: [
    'products:view', 'inventory:view',
    'orders:view', 'customers:view', 'support:manage',
  ],
};

export const STORE_ROLE_LABELS: Record<StoreRole, string> = {
  owner: 'المالك',
  manager: 'مدير',
  orders: 'موظف طلبات',
  products: 'موظف منتجات',
  customer_service: 'خدمة عملاء',
};

/** أقسام لوحة المنصة ومستويات الصلاحية. */
export const ADMIN_SECTIONS = [
  'dashboard','merchants','stores','users','employees','orders','products',
  'customers','plans','subscriptions','payments','commissions','partners',
  'payouts','domains','notifications','support','reports','security',
  'audit_logs','feature_flags','system_health','maintenance','settings','content',
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const ADMIN_LEVELS = [
  'none','view','create','edit','delete','approve','manage',
] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export function levelRank(level: AdminLevel): number {
  return ADMIN_LEVELS.indexOf(level);
}

export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: 'لوحة التحكم', merchants: 'التجار', stores: 'المتاجر',
  users: 'المستخدمون', employees: 'موظفو المتاجر', orders: 'الطلبات',
  products: 'المنتجات', customers: 'العملاء', plans: 'الباقات',
  subscriptions: 'الاشتراكات', payments: 'المدفوعات', commissions: 'العمولات',
  partners: 'الشركاء', payouts: 'دفعات الشركاء', domains: 'الدومينات',
  notifications: 'الإشعارات', support: 'الدعم', reports: 'التقارير',
  security: 'الأمان', audit_logs: 'سجل التدقيق', feature_flags: 'الميزات',
  system_health: 'صحة النظام', maintenance: 'الصيانة', settings: 'الإعدادات',
  content: 'المحتوى',
};
