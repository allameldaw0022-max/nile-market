# 12. API & Server Actions Architecture

## 12.1 اختيار الآلية

| الحالة | الآلية |
|---|---|
| قراءة لعرض صفحة | **Server Component** يستعلم مباشرة |
| كتابة يبدأها المستخدم من الواجهة | **Server Action** |
| Webhook · Cron · رفع ملف · تصدير · sitemap | **Route Handler** `/api/v1/*` |
| عملية ذرّية مالية أو متعددة الجداول | **Postgres RPC** يُستدعى من Server Action |
| عمل طويل | **Job** في `job_queue` + Edge Function |

> لا يوجد REST API عام للأطراف الثالثة في v1، لكن مساحة الأسماء `/api/v1`
> محجوزة من الآن حتى لا تُكسر العناوين لاحقًا.

## 12.2 الهيكل الإلزامي لكل Server Action

```ts
'use server';
import 'server-only';

export async function createProduct(raw: unknown) {
  // 1) تحقق من المدخلات — zod، لا ثقة بأي حقل
  const input = createProductSchema.parse(raw);

  // 2) سلطة — يرمي ويوقف التنفيذ
  const ctx = await requireStoreAccess(input.storeId, 'products:create');

  // 3) بوابة الميزة + حد الباقة
  await assertFeature('products');
  await assertWithinLimit(ctx.storeId, 'products.max');

  // 4) معدل الطلبات
  await rateLimit(`product:create:${ctx.userId}`, { max: 30, window: '1m' });

  // 5) العملية (ذرّية في القاعدة)
  const { data, error } = await db.rpc('create_product', { ...input, p_store_id: ctx.storeId });
  if (error) throw toAppError(error);

  // 6) تدقيق + إبطال cache
  await audit('product.created', { resource: data.id, after: data });
  revalidateTag(`store:${ctx.storeId}:products`);

  return { ok: true, data };
}
```

**الترتيب ملزم:** تحقق ← سلطة ← ميزة/حد ← معدل ← عملية ← تدقيق.
تخطي أي خطوة = رفض في مراجعة الكود، وتُفحص آليًا بقاعدة ESLint مخصصة
(`no-unguarded-server-action`).

## 12.3 التحقق من المدخلات

- **zod** لكل مدخل، والمخططات مشتركة بين العميل والخادم (نفس الرسائل بالعربية).
- الخادم **لا يثق** بالتحقق العميلي إطلاقًا ويعيده كاملًا.
- حقول محظورة تُسقَط صراحة (`.strict()`): `storeId` في مسارات المتجر
  (من الـHost)، وأي `price`/`total`/`fee`/`discount`/`commission` من العميل.
- تنقية النصوص الحرة (وصف المنتج، رسائل الدعم) بـDOMPurify قبل التخزين
  **وعند العرض** (دفاع مزدوج ضد XSS).

## 12.4 صيغة الاستجابة والأخطاء

```ts
type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { code: ErrorCode; message: string;
                          field?: string; details?: unknown;
                          action?: { label: string; href: string } } };
```

| `code` | HTTP | الرسالة العربية (للمستخدم) |
|---|---|---|
| `UNAUTHENTICATED` | 401 | «يجب تسجيل الدخول للمتابعة» |
| `FORBIDDEN` | 403 | «ليس لديك صلاحية لهذا الإجراء» |
| `NOT_FOUND` | 404 | «العنصر غير موجود» |
| `VALIDATION_ERROR` | 422 | رسالة الحقل المحدد |
| `LIMIT_EXCEEDED` | 402 | «وصلت إلى حد باقتك» + زر ترقية |
| `SUBSCRIPTION_INACTIVE` | 402 | «اشتراك المتجر غير نشط» |
| `FEATURE_DISABLED` | 403 | «هذه الميزة غير متاحة حاليًا» |
| `ILLEGAL_TRANSITION` | 409 | «لا يمكن الانتقال من X إلى Y» |
| `CONFLICT` | 409 | «تم تعديل البيانات من مكان آخر» |
| `RATE_LIMITED` | 429 | «محاولات كثيرة — حاول بعد قليل» |
| `INTERNAL` | 500 | «حدث خطأ، تم إبلاغ الفريق» |

**قواعد صارمة:**
- ❌ لا تسريب SQL ولا أسماء جداول ولا stack traces للعميل.
- ❌ لا تمييز «بريد غير موجود» عن «كلمة مرور خاطئة» (§6) — رسالة واحدة.
- ✅ كل خطأ داخلي يُسجَّل خادميًا بـ`correlationId` يُعرض للمستخدم للدعم.
- ✅ `FORBIDDEN` على مورد قد لا يملكه المستخدم يُعاد كـ`NOT_FOUND` لمنع
  تعداد الموارد.

## 12.5 Idempotency

| العملية | المفتاح |
|---|---|
| إنشاء طلب | `(store_id, idempotency_key)` من صفحة الدفع |
| تسجيل دفعة | `(kind, idempotency_key)` |
| اعتماد استرداد | `refunds.idempotency_key` |
| صرف شريك | `partner_payouts.idempotency_key` |
| احتساب عمولة | `unique(payment_id)` بنيويًا |
| Webhook | `external_event_id` |

الآلية العامة: `idempotency_keys(scope, key, request_hash, status, response)`
— نفس المفتاح بنفس الـhash ⇒ تُعاد الاستجابة المحفوظة؛ بـhash مختلف ⇒
`CONFLICT`.

## 12.6 Rate Limiting

| المورد | الحد |
|---|---|
| تسجيل الدخول | 5/15د لكل (بريد+IP) ثم تأخير تصاعدي |
| التسجيل | 3/ساعة لكل IP |
| استعادة كلمة المرور | 3/ساعة لكل بريد |
| إنشاء طلب | 10/دقيقة لكل جلسة/IP |
| التحقق من كوبون | 20/دقيقة |
| رسائل الدعم | 10/دقيقة |
| رفع ملف | 30/ساعة لكل متجر |
| البحث في المتجر | 60/دقيقة لكل IP |
| Webhooks | 100/دقيقة لكل مزوّد |

التنفيذ: عدّاد في القاعدة (`rate_limit_counters`) على Free Tier — بلا
خدمة مدفوعة. الطبقة مجرّدة ⇒ الانتقال إلى Upstash/Vercel Firewall لاحقًا
يمسّ ملفًا واحدًا. **قرار واعٍ:** عدّاد قاعدة بيانات يكفي لحجم الإطلاق
ويتحمّل التوزيع، وتكلفته أقل من خدمة إضافية.

## 12.7 Webhooks (مستقبلًا)

حتى مع غياب بوابات دفع في v1، البنية جاهزة:
1. تحقق من التوقيع (HMAC) قبل قراءة الجسم.
2. رفض الطوابع الأقدم من 5 دقائق (منع Replay).
3. حفظ `external_event_id` ⇒ لا معالجة مرتين.
4. رد **200 فورًا** ثم المعالجة في `job_queue`.
5. سجل كامل للأحداث الفاشلة + إعادة محاولة أسّية.

## 12.8 الإصدارات

- `/api/v1/*` من اليوم.
- Server Actions ليست عقدًا عامًا ⇒ تتطور بحرية.
- أي تغيير كاسر في RPC ⇒ دالة جديدة `_v2` مع إبقاء القديمة حتى التحوّل.
- `database.types.ts` يُولَّد من القاعدة (`supabase gen types`) ويُفحص في CI.

## 12.9 عميل Supabase الخدمي

```ts
// lib/supabase/service.ts
import 'server-only';
// يتجاوز RLS — يُستخدم في: Cron · Webhooks · مهام النظام فقط.
// ❌ ممنوع في أي مسار يبدأه مستخدم.
export function createServiceClient() { /* SUPABASE_SERVICE_ROLE_KEY */ }
```
يُفحص في CI: أي استيراد لهذا الملف من `app/**` خارج `api/v1/(cron|webhooks)`
⇒ **فشل البناء**.
