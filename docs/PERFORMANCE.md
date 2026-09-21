# 18. Performance, PWA & Weak-Network Strategy

> الهدف: متجر يفتح بسرعة على هاتف متوسط بشبكة 3G في السودان، ضمن
> Supabase Free وVercel Free، **وقابل للترقية بلا إعادة بناء**.

## 18.1 أهداف القياس

| المقياس | الهدف (3G · هاتف متوسط) |
|---|---|
| LCP (المتجر) | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| TTFB (ISR) | < 600ms |
| JS للمتجر | < 120KB مضغوط |
| JS للوحة | < 200KB مضغوط |
| صورة المنتج (بطاقة) | < 40KB |

## 18.2 التصيير والتخزين المؤقت

| الصفحة | الاستراتيجية |
|---|---|
| صفحات المنصة التسويقية | Static + ISR 1h |
| الباقات | ISR 5m (تتغير من Admin) |
| رئيسية المتجر | ISR 60s + وسم `store:<id>:home` |
| قائمة المنتجات | ISR 60s + وسم `store:<id>:products` |
| صفحة المنتج | ISR 120s + وسم `product:<id>` |
| التصنيفات | ISR 300s |
| السلة · الدفع · الحساب · الطلبات | Dynamic (`no-store`) |
| اللوحات (تاجر/Admin/شريك) | Dynamic + `cache()` داخل الطلب |
| `getStoreContext(host)` | `unstable_cache` 60s + وسم `tenant:<host>` |

**الإبطال الدقيق (`revalidateTag`) لا الزمني وحده:**
تعديل منتج ⇒ `product:<id>` + `store:<id>:products` + `store:<id>:home`.
تغيير حالة متجر/دومين/اشتراك ⇒ `tenant:<host>` فورًا.

## 18.3 قاعدة البيانات

**الفهارس الحرجة:**
```sql
create index on products (store_id, status, created_at desc) where deleted_at is null;
create index on products using gin (to_tsvector('arabic', coalesce(name,'')||' '||coalesce(description,'')));
create index on orders (store_id, created_at desc);
create index on orders (store_id, status);
create index on order_items (order_id);
create index on store_members (profile_id, store_id) where status='active' and deleted_at is null;
create unique index on store_domains (lower(hostname));
create index on notifications (user_id, read_at, created_at desc);
create index on ledger_entries (account_kind, account_id, created_at desc);
create index on support_tickets (status, priority, created_at desc);
create index on audit_logs (store_id, created_at desc);
```

**منع N+1:** كل قائمة تُجلب باستعلام واحد مع العلاقات المضمّنة
(`select('*, product_images(...), categories(name)')`) — **ممنوع** حلقة
تستعلم لكل عنصر. يُفحص في مراجعة الكود وبقياس عدد الاستعلامات في اختبار
الأداء.

**Pagination إلزامي** على كل قائمة (افتراضي 20، سقف 100). الترقيم
بالمؤشر (keyset) على `(created_at, id)` للقوائم الطويلة — لا `OFFSET`
كبير.

**اختيار أعمدة صريح دائمًا** — `select('*')` ممنوع على الجداول العريضة
(يوفّر نقل بيانات ويمنع تسريب أعمدة حساسة بالخطأ).

**التحليلات مجمَّعة مسبقًا** في `analytics_daily` بـpg_cron ⇒ لوحة
الإحصائيات لا تمسح `orders` إطلاقًا (§25).

## 18.4 الشبكة والصور
- Server Components افتراضيًا؛ `"use client"` فقط عند الحاجة الحقيقية
  للتفاعل، وعلى أصغر مكوّن ممكن (ورقة الشجرة لا الصفحة).
- `next/image` بـ`sizes` صحيحة + `lazy` + `blur placeholder`؛
  `priority` لأول صورة فقط.
- AVIF/WebP بأحجام مولَّدة مسبقًا (راجع `STORAGE.md`).
- الخطوط: `swap` + preload لوزنين فقط + subset عربي.
- `dynamic()` للمكوّنات الثقيلة (الرسوم البيانية، محرر النصوص، ماسح QR).
- بلا مكتبات ثقيلة: لا moment · لا lodash كامل · `date-fns` بالاستيراد
  الجزئي فقط.
- `<link rel="preconnect">` إلى نطاق Supabase.

## 18.5 PWA (خصوصًا لوحة التاجر)

**manifest.webmanifest:** `display: standalone` · `dir: rtl` · `lang: ar`
· `theme_color: #0B1F3A` · أيقونات 192/512 + maskable · اختصارات
(الطلبات · إضافة منتج).

**Service Worker (يدوي، بلا مكتبة ثقيلة):**

| المورد | الاستراتيجية |
|---|---|
| هيكل التطبيق والخطوط والأيقونات | Cache-first |
| صور المنتجات | Stale-while-revalidate (سقف 50MB، LRU) |
| بيانات اللوحة (GET) | Network-first ثم cache كاحتياطي مع شارة «بيانات قد تكون قديمة» |
| الكتابة (POST/Actions) | **لا تُخزَّن** — تدخل طابور الإعادة |
| المتجر (زبائن) | Network-first مع صفحة offline |

**سلوك عدم الاتصال:**
1. شريط علوي: «لا يوجد اتصال — سيُعاد الإرسال تلقائيًا».
2. القراءة من الـcache مع وسم زمني واضح.
3. الكتابة تدخل `outbox` في IndexedDB وتُعاد عند العودة
   (**بنفس `idempotency_key`** ⇒ لا طلب مكرر ولا دفعة مكررة).
4. الأزرار تُظهر «بانتظار الاتصال» بدل الفشل.

**منع فقدان البيانات (§7, §27):**
- **Autosave** كل 3 ثوانٍ أو عند `blur` في: Wizard الإنشاء، نموذج المنتج،
  إعدادات المتجر — مسودة في IndexedDB + خادميًا للمسودات الطويلة.
- استعادة تلقائية عند العودة مع سؤال «لديك مسودة غير محفوظة — استعادة؟».
- `beforeunload` عند وجود تغييرات غير محفوظة.
- إعادة محاولة تلقائية أسّية (1s·2s·4s·8s) للطلبات القابلة للإعادة.

## 18.6 حدود الـFree Tier — بصراحة

| المورد | الحد التقريبي | المعالجة | متى نترقّى |
|---|---|---|---|
| Supabase DB | 500MB | لا صور في القاعدة · تقليم السجلات القديمة · مراقبة الحجم | > 400MB |
| Supabase Storage | 1GB | ضغط قبل الرفع + حصة لكل متجر | > 800MB |
| **إيقاف المشروع بعد أسبوع خمول** | ⚠️ | فحص صحة دوري يبقيه نشطًا | أول تاجر حقيقي |
| اتصالات القاعدة | محدودة | Supavisor/pooling · بلا اتصالات طويلة · Realtime مؤجّل | عند أخطاء الاتصال |
| Vercel Functions | زمن تنفيذ شهري | ISR بقوة · لا عمل ثقيل داخل الطلب | مراقبة الاستهلاك |
| **Vercel Cron** | **تشغيل يومي واحد** | ⇒ pg_cron هو المُشغِّل الأساسي | — |
| تحسين الصور | حصة شهرية | أحجام مولَّدة مسبقًا في Storage | — |
| **Vercel Hobby = غير تجاري** | ⚠️ شروط الاستخدام | **قرار تجاري — راجع Q7** | قبل أول اشتراك مدفوع |

**تصميم قابل للترقية بلا إعادة بناء:** كل حد يُعالَج بطبقة مجرّدة
(Rate Limit · Jobs · Email · Image · Tenant Provider) ⇒ الترقية تبديل
تنفيذ داخل ملف واحد، لا إعادة هيكلة.

## 18.7 القياس في CI
- Lighthouse CI على: رئيسية المتجر · صفحة منتج · لوحة التاجر — **يفشل
  البناء** إن هبطت الدرجات عن العتبة.
- `@next/bundle-analyzer` مع ميزانية حجم.
- اختبار عدد الاستعلامات لكل صفحة (كشف N+1 آليًا).
- `get_advisors(type='performance')` على Supabase قبل كل إصدار.
