# 10. Custom Domains & Tenant Routing

## 10.1 نوعا العنوان

| النوع | المثال | التوفر |
|---|---|---|
| **نطاق فرعي مجاني** | `ahmad-store.nilemarket.online` | لكل متجر — **جزء أساسي من المتجر** |
| **دومين مخصص** | `ahmadstore.com` | حسب الباقة (`custom_domain.enabled`) |

> **ممنوع** إنشاء مشروع استضافة أو Supabase Custom Domain لكل متجر
> (نص المواصفات). طبقة الـRouting وحدها مسؤولة عن الربط.

## 10.2 ربط Hostname → Store

```
GET https://ahmadstore.com/products/abc
      │
      ▼ proxy.ts (Vercel Edge)
  host = "ahmadstore.com"
      ├─ host ∈ PLATFORM_HOSTS → المنصة (وحظر /_sites/*)
      └─ rewrite → /_sites/ahmadstore.com/products/abc
            │
            ▼ layout المستأجر
      getStoreContext("ahmadstore.com")   ← unstable_cache, tag: tenant:<host>, 60s
            │
       استعلام واحد:
         select s.*, d.status as domain_status, sub.status as sub_status
         from store_domains d
         join stores s on s.id = d.store_id
         left join subscriptions sub on sub.store_id = s.id
         where d.hostname = lower($1) and d.status in ('active','ssl_active')
            │
            ├─ لا نتيجة            → Store Not Found (404)
            ├─ stores.status=suspended → Store Suspended
            ├─ stores.status=closed    → Store Closed
            ├─ الاشتراك منتهٍ          → وضع محدود (حسب Q2)
            └─ نجاح → StoreContext { storeId, slug, primaryHost, theme, … }
```

**النطاقات الفرعية** لها صف في `store_domains` أيضًا (`kind='subdomain'`,
`status='active'`) ⇒ مسار بحث **واحد** لا فرعان، ولا استثناءات أمنية.

### قواعد أمنية
1. `storeId` يُشتق من الـHost فقط — **لا يُقبل من الطلب** (منع IDOR).
2. `unique(lower(hostname))` **عالميًا** ⇒ دومين واحد لمتجر واحد.
3. `/_sites/*` مرفوض من دومين المنصة (404) ⇒ لا انتحال مستأجر.
4. الـcache يُبطَل فورًا (`revalidateTag`) عند أي تغيير في الدومين أو
   حالة المتجر أو الاشتراك — لا يبقى متجر موقوف حيًا 60 ثانية.
5. مسارات `/dashboard`, `/admin`, `/partner` **مرفوضة** على دومينات
   المستأجرين (تُعاد 404، لا redirect يكشف وجودها).

## 10.3 دورة حياة الدومين

```
  [إضافة]──▶ pending ──▶ verification_required ──▶ verifying
                                                      │
                            ┌─────────────────────────┤
                            ▼ فشل                     ▼ نجاح
                        ┌────────┐              ┌────────────┐
                        │ failed │              │ ssl_pending│
                        └───┬────┘              └──────┬─────┘
                            │ إعادة محاولة              ▼
                            └───────────▶        ┌────────────┐
                                                 │ ssl_active │◀── active
                                                 └──────┬─────┘
                                                        │
                        ┌───────────────┬───────────────┤
                        ▼               ▼               ▼
                  ┌───────────┐   ┌─────────┐    (تخفيض باقة)
                  │ suspended │   │ removed │    → suspended
                  └───────────┘   └─────────┘      (لا حذف)
```

| الحالة | المعنى |
|---|---|
| `pending` | أُضيف، لم تُعرض التعليمات بعد |
| `verification_required` | تعليمات DNS معروضة، بانتظار التاجر |
| `verifying` | فحص DNS جارٍ (Job كل 5 دقائق، 24 ساعة ثم `failed`) |
| `active` / `ssl_pending` / `ssl_active` | تحقق نجح / شهادة قيد الإصدار / جاهز |
| `failed` | لم يتحقق ضمن المهلة — قابل لإعادة المحاولة |
| `suspended` | إيقاف إداري أو ميزة مغلقة بالباقة — **البيانات محفوظة** |
| `removed` | أزاله التاجر — الصف **يبقى** بـ`released_at` لمنع إعادة الاستخدام بلا تحقق |

## 10.4 التحقق من الملكية

**السجل المطلوب من التاجر** (تُعرض التعليمات جاهزة للنسخ):
```
النوع:   TXT
الاسم:   _nile-verify.ahmadstore.com
القيمة:  nile-verify=<verification_token>      ← عشوائي 32 بايت لكل دومين
```
ثم التوجيه:
```
النوع: CNAME  ·  الاسم: www  ·  القيمة: cname.vercel-dns.com
النوع: A      ·  الاسم: @    ·  القيمة: 76.76.21.21
```

**Job التحقق** (Edge Function كل 5 دقائق):
1. استعلام DNS عن TXT ⇒ مطابقة التوكن.
2. عند النجاح: `verified_at` + إضافة الدومين عبر **Vercel Domains API**
   (توكن خادمي في Env) ⇒ `ssl_pending`.
3. استطلاع حالة الشهادة ⇒ `ssl_active`.
4. فشل ⇒ `failure_reason` برسالة عربية واضحة + إشعار للتاجر.

### منع Domain Takeover
- إعادة تحقق كاملة عند كل إضافة/إعادة ربط — حتى لو كان الدومين مسجّلًا سابقًا.
- صف `removed` يبقى؛ إعادة الإضافة تتطلب **توكن جديدًا** ودورة تحقق جديدة.
- `verification_token` يُدوَّر عند كل محاولة إضافة.
- **فحص دوري لكل الدومينات النشطة** (يوميًا): اختفى الـTXT أو تغيّر
  التوجيه ⇒ `failed` + إشعار ⇒ لا يبقى دومين مربوطًا بعد انتهاء ملكيته.
- عند حذف متجر أو إيقافه: تُسحب دوميناته من Vercel فورًا.

## 10.5 الدومين الأساسي و www

- `is_primary` واحد لكل متجر (unique جزئي).
- كل الدومينات غير الأساسية ⇒ **301** إلى الأساسي مع الحفاظ على المسار.
- `redirect_www`: `www.x.com` ⇒ 301 إلى `x.com` (أو العكس حسب الأساسي).
- تغيير الأساسي ⇒ إبطال الـcache فورًا + تحديث sitemap/canonical.

## 10.6 الدومينات والاشتراكات

| الحدث | الأثر |
|---|---|
| باقة لا تسمح بالدومين | منع الإضافة برسالة واضحة + زر ترقية (**لا فشل غامض**) |
| Downgrade | الدومين → `suspended`، **لا يُحذف**؛ المتجر يعود للنطاق الفرعي |
| Upgrade بعد ذلك | يعود `active` **بلا إعادة تحقق** (الملكية مثبتة سابقًا) |
| انتهاء الاشتراك | الدومين يبقى مسجّلًا؛ سلوك الواجهة حسب Q2 |

> **النطاق الفرعي المجاني لا يتأثر بأي من ذلك** — جزء أساسي من المتجر.

## 10.7 SEO والمشاركة

- **Canonical** يُبنى دائمًا على `primaryHost` ⇒ لا محتوى مكرر بين
  النطاق الفرعي والدومين المخصص.
- `sitemap.xml` لكل متجر: `https://<primaryHost>/sitemap.xml` (منتجات
  منشورة + تصنيفات + صفحات ثابتة)، يُولَّد ديناميكيًا ويُخزَّن 1h.
- `robots.txt` لكل متجر: يمنع `/cart`, `/checkout`, `/account`, `/order/*`.
- **Open Graph** لكل صفحة: `og:url` = canonical · `og:image` = صورة المنتج
  المحسّنة (1200×630) · `og:site_name` = اسم المتجر · `og:locale = ar_SD`.
- **Structured Data**: `Product` + `Offer` + `BreadcrumbList` +
  `Organization` — بأسعار وتوفر حقيقية من القاعدة.
- المشاركة: WhatsApp · Facebook · Telegram · نسخ الرابط — كلها تستخدم
  الـcanonical.

## 10.8 تغيير Store Slug

1. `stores.slug` يتغير ⇒ يُنشأ صف `store_domains` جديد للنطاق الفرعي الجديد.
2. القديم يبقى بحالة `active` مع `redirect_to_primary` ⇒ **301** (المدة
   وسياسة الحجز — سؤال **Q13**).
3. لا تُفقد أي بيانات؛ وتُبطَّل الـcaches ويُحدَّث الـsitemap.
4. يُسجَّل التغيير في `audit_logs` ويتطلب `settings:update`.

## 10.9 التوسع

- كل الدومينات في مشروع Vercel **واحد** ⇒ لا انفجار بنية تحتية.
- الحد العملي = حد الدومينات في خطة Vercel (راجع **Q7**).
- `store_domains.hostname` مفهرس فريدًا ⇒ البحث O(log n) مهما كثر العدد.
- الانتقال إلى طبقة توجيه أخرى (Cloudflare مثلًا) يمسّ
  `lib/tenant/provider.ts` فقط، لا بقية النظام.
