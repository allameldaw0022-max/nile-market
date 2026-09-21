# 5. Roles & Permissions Matrix — الأدوار والصلاحيات

## 5.1 فئات الفاعلين

| الفئة | مصدر الدور | النطاق |
|---|---|---|
| **Store roles** | `store_members.role` + `permissions[]` | متجر واحد |
| **Platform roles** | `admin_members` + `admin_permissions` | المنصة، **حسب القسم والمستوى** |
| **Partner** | `partners` | بياناته هو فقط |
| **Customer** | مستخدم مسجّل | سجله داخل المتجر الذي تعامل معه |
| **Anonymous** | زائر | المحتوى العام فقط |

> مستخدم واحد يمكن أن يكون تاجرًا في متجر، وموظفًا في آخر، وعميلًا في
> ثالث — لذلك **الدور سياقي دائمًا**، وتُحسب الصلاحية بدلالة
> `(actor, store_id, permission)` لا بدلالة المستخدم وحده.

---

## 5.2 صلاحيات المتجر — الأدوار الافتراضية

الرموز: ✅ مسموح · ➖ ممنوع · 👁 قراءة فقط · ⚠️ مقيّد (انظر الحاشية)

| المورد | Owner | Manager | Orders | Products | Customer Service |
|---|---|---|---|---|---|
| لوحة المتجر (ملخص) | ✅ | ✅ | 👁 طلبات | 👁 منتجات | 👁 محدود |
| المنتجات — عرض | ✅ | ✅ | 👁 | ✅ | 👁 |
| المنتجات — إضافة/تعديل | ✅ | ✅ | ➖ | ✅ | ➖ |
| المنتجات — حذف | ✅ | ✅ | ➖ | ⚠️¹ | ➖ |
| `cost_price` (سعر التكلفة) | ✅ | ✅ | ➖ | ✅ | ➖ |
| التصنيفات | ✅ | ✅ | ➖ | ✅ | ➖ |
| المخزون — عرض | ✅ | ✅ | ✅ | ✅ | 👁 |
| المخزون — تعديل | ✅ | ✅ | ➖ | ✅ | ➖ |
| الطلبات — عرض | ✅ | ✅ | ✅ | 👁² | ✅ |
| الطلبات — تغيير الحالة | ✅ | ✅ | ✅ | ➖ | ⚠️³ |
| الطلبات — إلغاء | ✅ | ✅ | ✅ | ➖ | ➖ |
| الطلبات — تأكيد الدفع | ✅ | ✅ | ✅ | ➖ | ➖ |
| العملاء — عرض | ✅ | ✅ | ✅ | ➖ | ✅ |
| العملاء — تعديل/حذف | ✅ | ✅ | ➖ | ➖ | ➖ |
| الكوبونات والعروض | ✅ | ✅ | ➖ | ➖ | ➖ |
| التوصيل (مناطق وأسعار) | ✅ | ✅ | ➖ | ➖ | ➖ |
| الموظفون — عرض | ✅ | ✅ | ➖ | ➖ | ➖ |
| الموظفون — دعوة/تعديل/إيقاف | ✅ | ⚠️⁴ | ➖ | ➖ | ➖ |
| التصميم والإعدادات العامة | ✅ | ✅ | ➖ | ➖ | ➖ |
| بيانات البنوك / الدفع | ✅ | ➖ | ➖ | ➖ | ➖ |
| الدومين | ✅ | ➖ | ➖ | ➖ | ➖ |
| الاشتراك والفواتير | ✅ | ➖ | ➖ | ➖ | ➖ |
| الإحصائيات | ✅ | ✅ | 👁 طلبات | 👁 منتجات | ➖ |
| تصدير البيانات | ✅ | ✅ | ⚠️⁵ | ⚠️⁵ | ➖ |
| سجل نشاط المتجر | ✅ | 👁 | ➖ | ➖ | ➖ |
| تذاكر الدعم للمتجر | ✅ | ✅ | ➖ | ➖ | ✅ |
| حذف/إغلاق المتجر | ✅ | ➖ | ➖ | ➖ | ➖ |

¹ أرشفة فقط (`status='archived'`)، لا حذف نهائي.
² بيانات المنتجات المطلوبة للتجهيز فقط — **لا هاتف ولا عنوان العميل**.
³ إلى `confirmed` أو `cancelled` فقط، ولا يلمس الدفع.
⁴ يدعو أدوارًا **أدنى من دوره فقط**؛ لا يمسّ دور `owner` ولا يرفع أحدًا إليه.
⁵ ضمن نطاق مورده فقط.

### Data Access Scope داخل المتجر
| الدور | يرى |
|---|---|
| Owner | كل شيء في متجره |
| Manager | كل شيء عدا البيانات البنكية والدومين والاشتراك |
| Orders | الطلبات وبيانات التوصيل والاتصال للعميل — **لا `cost_price` ولا الهوامش** |
| Products | الكتالوج والمخزون والتكلفة — **لا بيانات عملاء ولا هواتف** |
| Customer Service | الطلبات وبيانات الاتصال والتذاكر — **لا أرباح ولا تكلفة ولا إعدادات** |

---

## 5.3 صلاحيات المنصة (Admin)

مستقلة **لكل قسم** بمستوى واحد من: `none < view < create < edit < delete < approve < manage`.

| القسم | Admin Owner | Ops (تشغيل) | Finance (مالية) | Support (دعم) |
|---|---|---|---|---|
| dashboard | manage | view | view | view |
| merchants / stores | manage | edit | view | view |
| users | manage | view | none | view⚠️ |
| employees (موظفو المتاجر) | manage | view | none | none |
| orders | manage | view | view | view |
| products | manage | edit | none | view |
| customers | manage | view | none | view⚠️ |
| plans | manage | none | edit | none |
| subscriptions | manage | view | approve | view |
| payments | manage | none | **approve** | **none** |
| commissions | manage | none | **approve** | **none** |
| partners | manage | view | edit | none |
| payouts | manage | none | **approve** | **none** |
| domains | manage | edit | none | view |
| notifications | manage | create | none | create |
| support | manage | view | none | **manage** |
| reports | manage | view | view | view |
| security | manage | view | none | none |
| audit_logs | view¹ | view | view | none |
| feature_flags | manage | view | none | none |
| system_health | manage | view | none | view |
| maintenance | manage | none | none | none |
| settings | manage | none | none | none |
| content (المساعدة) | manage | edit | none | edit |

¹ حتى Admin Owner **لا يملك `delete` على `audit_logs`** — الجدول إلحاقي على
مستوى القاعدة. لا يوجد «حساب خارق» (§36).

> الأعمدة Ops/Finance/Support هي **قوالب جاهزة** يقترحها النظام عند إنشاء
> موظف؛ كل صلاحية تبقى قابلة للضبط فرديًا (`admin_permissions`).

### ⚠️ Data Access Matrix للمنصة (§24 من الإضافات)
الوصول إلى **الصفحة** لا يعني الوصول إلى **البيانات**:

| نوع البيانات | من يراه |
|---|---|
| المبالغ والمدفوعات وإثباتات التحويل | `payments ≥ view` فقط |
| العمولات والمستحقات | `commissions ≥ view` فقط |
| بيانات البنوك للمتاجر | `settings = manage` فقط + يُسجَّل كل وصول في `audit_logs` |
| هاتف/بريد العميل النهائي | `customers ≥ view`، ويُعرض **مقنّعًا** (`09xx xxx 123`) إلا بـ`edit` |
| محتوى رسائل الدعم | `support ≥ view` |
| الملاحظات الداخلية للدعم | `support ≥ view` **staff فقط** |
| `before/after` في سجل التدقيق | `audit_logs ≥ view` |

**قاعدة صريحة:** موظف الدعم **لا يرى البيانات المالية** ولو فتح تذكرة عن
فاتورة — يرى وجود الدفعة وحالتها، لا مبلغها ولا إثباتها، ما لم تُمنح له
`payments:view` صراحة.

---

## 5.4 Partner / Customer / Anonymous

| المورد | Partner | Customer | Anonymous |
|---|---|---|---|
| رابط الإحالة الخاص به | ✅ عرض ونسخ | ➖ | ➖ |
| قائمة التجار المحالين | 👁 **الاسم والحالة وتاريخ الانضمام فقط** | ➖ | ➖ |
| مبيعات/طلبات/عملاء التاجر المحال | ➖ **ممنوع منعًا باتًا** | ➖ | ➖ |
| اشتراكات التجار المحالين | 👁 الباقة وتاريخ الدفع والمبلغ **المولِّد للعمولة** فقط | ➖ | ➖ |
| سجل عمولاته ومستحقاته ودفعاته | 👁 | ➖ | ➖ |
| تعديل نسبة عمولته | ➖ | ➖ | ➖ |
| تعديل علاقة الإحالة | ➖ | ➖ | ➖ |
| طلب صرف مستحقات | ✅ | ➖ | ➖ |
| تذاكر دعم خاصة به | ✅ | ✅ | ➖ |
| تصفح متجر ومنتجات منشورة | ✅ | ✅ | ✅ |
| سلة وWishlist | — | ✅ | ✅ (سلة مجهولة بكوكي) |
| إنشاء طلب | — | ✅ | ✅ Guest Checkout |
| متابعة طلبه | — | ✅ | ✅ برقم الطلب + الهاتف |
| طلبات/عناوين غيره | ➖ | ➖ | ➖ |

---

## 5.5 التمثيل في الكود

```ts
// lib/authz/permissions.ts
export type StorePermission =
  | 'products:view'|'products:create'|'products:update'|'products:delete'
  | 'categories:manage' | 'inventory:view'|'inventory:update'
  | 'orders:view'|'orders:update'|'orders:cancel'|'orders:payment'
  | 'customers:view'|'customers:update'
  | 'coupons:manage'|'promotions:manage'|'delivery:manage'
  | 'members:view'|'members:manage'
  | 'settings:view'|'settings:update'|'settings:banking'
  | 'domain:manage'|'subscription:manage'
  | 'analytics:view'|'export:data'|'audit:view'|'support:manage';

export const STORE_ROLE_PERMISSIONS: Record<StoreRole, StorePermission[]> = { /* 5.2 */ };
```

نفس الجدول **مكرّر داخل القاعدة** في `app.role_default_permissions(role)`
⇒ مصدر واحد منطقي بجدارين. أي اختلاف بينهما يُكشف باختبار تكافؤ آلي
ضمن `TESTING.md`.

### الاستخدام الإلزامي
```ts
// كل Server Action تبدأ هكذا — بلا استثناء
export async function updateProduct(input: unknown) {
  const data = updateProductSchema.parse(input);           // 1) تحقق
  const ctx  = await requireStoreAccess(data.storeId, 'products:update'); // 2) سلطة
  await assertFeature('products.edit');                    // 3) feature flag
  const res = await db.rpc('update_product', { ... });     // 4) عملية ذرّية
  await audit('product.updated', { before, after });       // 5) تدقيق
  revalidateTag(`store:${ctx.storeId}:products`);
}
```

**قاعدة مراجعة الكود:** Server Action بلا `require*Access` = رفض المراجعة.
تُفرض آليًا بقاعدة ESLint مخصصة ضمن `PERFORMANCE.md → CI`.
