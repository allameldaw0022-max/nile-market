# 20. Deployment Architecture

## 20.1 البيئات

| البيئة | Vercel | Supabase | الغرض |
|---|---|---|---|
| **Local** | `next dev` | `supabase start` (Docker) | تطوير واختبار migrations |
| **Preview** | نشر تلقائي لكل PR | فرع Supabase أو مشروع staging | مراجعة + E2E |
| **Production** | فرع `main` | مشروع `nile-market` (`pxnaraiqqgmhnidbouyk`) | الإنتاج |

> **Staging منفصل ليس ضروريًا في البداية** — Preview + فرع قاعدة بيانات
> يكفيان ويوفّران التكلفة. يضاف عند وجود عدة مطورين أو بيانات حساسة.

## 20.2 متغيرات البيئة

### عامة (آمنة في المتصفح)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL          # https://nilemarket.online
NEXT_PUBLIC_ROOT_DOMAIN       # nilemarket.online
```

### خادمية فقط (❌ لا تصل المتصفح أبدًا)
```
SUPABASE_SERVICE_ROLE_KEY     # يتجاوز RLS — server-only
CRON_SECRET                   # حماية /api/v1/cron/*
RESEND_API_KEY                # مزوّد البريد المعتمد (D24)
EMAIL_FROM
HOSTING_PROVIDER_TOKEN        # إدارة الدومينات عبر HostingProvider (D21)
VERCEL_PROJECT_ID
VERCEL_TEAM_ID
```

**قواعد ملزمة:**
- ❌ لا أسرار في المستودع أبدًا — `.env.example` يوثّق الأسماء فقط
  (✅ الوضع الحالي سليم).
- `.env.local` في `.gitignore` (✅ موجود).
- الأسرار تُضاف من لوحة Vercel لكل بيئة على حدة.
- `gitleaks` في CI يمنع أي تسريب.
- **⚠️ إصلاح مطلوب:** `next.config.ts` يثبّت `qkinvnwtsaaemdygapvn.supabase.co`
  (مشروع قديم) ⇒ يُشتق الـhostname من `NEXT_PUBLIC_SUPABASE_URL`.
- دوران المفاتيح عند أي اشتباه، ومجدولًا كل 6 أشهر.

## 20.3 Migrations

```
supabase/migrations/NNNN_description.sql   ← ترقيم متسلسل (النمط الحالي ✅)
```

**القواعد:**
1. كل تغيير في المخطط = migration جديدة. **ممنوع** تعديل ملف مطبَّق.
2. كل migration قابلة للتطبيق مرة واحدة وآمنة للإعادة
   (`if not exists` حيث يصح).
3. لا migration تحذف عمودًا أو جدولًا يحمل بيانات إنتاج دون قرار صريح.
4. إضافة قيمة enum في migration مستقلة (درس مستفاد من `0009` ✅).
5. `set search_path` صريح في **كل** دالة (درس `0021` ✅ — وكان سبب كسر
   كل عمليات التسجيل).
6. التطبيق: `supabase db push` من CI بعد نجاح الاختبارات.
7. اختبار كل migration على نسخة من الإنتاج قبل التطبيق.
8. **خطة تراجع** مكتوبة لكل migration محفوفة بالمخاطر.

### الوضع الحالي
مشروع الإنتاج **فارغ (صفر جداول، صفر migrations)** ⇒ المخطط الجديد
يُطبَّق من الصفر بلا ترحيل بيانات مؤلم. **هذه نافذة يجب استغلالها قبل
دخول أي بيانات حقيقية.**

## 20.4 النشر

```
push إلى main
   └─▶ CI: lint · typecheck · unit · pgTAP · e2e · gitleaks
         └─▶ تطبيق migrations على الإنتاج
               └─▶ نشر Vercel
                     └─▶ فحص صحة /api/v1/health
                           └─▶ فشل ⇒ rollback فوري (Vercel instant rollback)
```

**ترتيب إلزامي:** القاعدة **قبل** الكود دائمًا، والـmigrations متوافقة
مع الإصدار السابق (توسيع ثم تحويل ثم تقليص) ⇒ لا انقطاع أثناء النشر.

## 20.5 إعداد Supabase

| الإعداد | القيمة |
|---|---|
| Auth Providers | Email + Password · Google OAuth |
| Email confirmations | **مفعّل** |
| **Custom SMTP** | **إلزامي** — البريد المدمج محدود جدًا وغير إنتاجي |
| Redirect URLs | قائمة بيضاء صريحة (المنصة + معاينات) |
| JWT expiry | 1 ساعة + refresh |
| Exposed schemas | `public` فقط — **`app` غير مكشوفة** |
| Extensions | `pgcrypto` · `pg_cron` · `pg_net` · `citext` · `pg_trgm` |
| PITR | غير متاح على Free — يُعوَّض بنسخ يدوية (20.6) |
| Network restrictions | تُفعَّل عند الترقية |

## 20.6 النسخ الاحتياطي والاسترجاع

| الطبقة | الآلية |
|---|---|
| نسخ Supabase التلقائية | يومية على Free (احتفاظ محدود) |
| **نسخة منطقية إضافية** | `pg_dump` يومي عبر GitHub Action → تخزين خارجي مشفّر |
| الملفات | Job أسبوعي يُصدّر بيان الملفات + نسخ المهم |
| **اختبار الاستعادة** | **شهريًا** — استعادة في مشروع مؤقت والتحقق من السلامة |
| البيانات المالية | `ledger_entries` · `commission_ledger` · `payments` · `audit_logs` إلحاقية ⇒ لا تُفقد بتعديل خاطئ |

> نسخة لم تُختبر استعادتها = لا نسخة. الاختبار الشهري جزء من الروتين.

## 20.7 المراقبة

| المجال | الأداة |
|---|---|
| أخطاء التطبيق | `error.tsx` + تسجيل مهيكل + `correlationId` (Sentry لاحقًا) |
| أداء الويب | Vercel Analytics (مجاني) |
| سجلات الدوال | Vercel Logs |
| صحة القاعدة | Supabase Logs + `get_advisors` دوريًا |
| صحة النظام | `/admin/system-health` من `system_health_checks` |
| المهام الخلفية | لوحة `job_queue` (معلّقة · فاشلة · زمن المعالجة) |
| التنبيهات | فشل مهمة متكرر · فشل بريد · تدهور صحة ⇒ إشعار Admin |

**فحص الصحة** كل 5 دقائق: القاعدة · Auth · Storage · API · المهام ·
البريد · الدومينات ⇒ `healthy | degraded | down`.
> فائدة جانبية مهمة: يمنع **إيقاف مشروع Supabase Free بعد أسبوع خمول**.

## 20.8 Maintenance Mode
`platform_settings.maintenance_mode` ⇒ `proxy.ts` يعيد صفحة صيانة عربية
مصمَّمة، مع استثناء `/admin` و`/api/v1/health` ⇒ الفريق يواصل العمل.
قابل للتفعيل لجزء (`/dashboard` فقط) دون إسقاط المتاجر.

## 20.9 قائمة الإطلاق
- [ ] الدومين `nilemarket.online` + wildcard `*.nilemarket.online`
- [ ] SSL فعّال على الجذر والنطاقات الفرعية
- [ ] كل متغيرات البيئة مضبوطة في Vercel (production)
- [ ] `next.config.ts` يشتق hostname من `NEXT_PUBLIC_SUPABASE_URL`
- [ ] كل الـmigrations مطبَّقة على الإنتاج
- [ ] Custom SMTP مضبوط ومختبَر
- [ ] Google OAuth مضبوط بـredirect URLs صحيحة
- [ ] pg_cron مجدول (كنس الاشتراكات · البريد · التحليلات · الصحة)
- [ ] النسخ الاحتياطي يعمل + **استعادة مختبَرة مرة واحدة على الأقل**
- [ ] `get_advisors` = صفر تحذيرات حرجة
- [ ] الباقات والحدود مُدخلة (بعد Q4)
- [ ] الصفحات القانونية منشورة
- [ ] **لا بيانات Mock في الإنتاج**
- [ ] **حسابا Admin نشطان على الأقل** بـ2FA مفعّل (D29) — بدونهما كل
      استرداد وصرف شريك مستحيل تقنيًا
- [ ] **أسعار وحدود الباقات مُدخلة** و`commercial_launch_enabled = true` (D31)
- [ ] `supabase/legacy-migrations/` **لم تُطبَّق** على قاعدة V1 (D34)
- [ ] Sitemap وrobots يعملان للمنصة ولكل متجر
