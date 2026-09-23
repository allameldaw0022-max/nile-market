# ضبط النطاق وSupabase والبريد — nilemarket.online

**التاريخ:** 2026-09-23 · **مشروع Supabase:** `pxnaraiqqgmhnidbouyk`
**مشروع Vercel:** `nile-market` (`prj_MNQPFzBawk0Zf41qpx8fuDWbzqjP`)

---

## ١) ما ضُبط فعلًا (تمّ)

### النطاقات على Vercel

| النطاق | الحالة | الغرض |
|---|---|---|
| `nilemarket.online` | ✅ متحقَّق | الموقع العام ولوحة التحكّم |
| `*.nilemarket.online` | ✅ **أُضيف ومتحقَّق** | **نطاق كل متجر** — بدونه لا يفتح أي متجر |
| `www.nilemarket.online` | ✅ أُضيف — تحويل 308 | يوجّه إلى النطاق الأساسي |

> `*.nilemarket.online` كان **ناقصًا**. المنصّة تعطي كل متجر نطاقًا
> فرعيًا (`store.nilemarket.online`)، وبلا هذا السجلّ كانت كل متاجر
> العملاء ستعطي خطأ نطاق غير معروف.

### متغيّرات البيئة

| المتغيّر | القيمة | الحالة |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://nilemarket.online` | ✅ صُحِّح (كان يشير إلى `vercel.app`) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `nilemarket.online` | ✅ كان صحيحًا |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pxnaraiqqgmhnidbouyk.supabase.co` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح النشر العامّ | ✅ |

---

## ٢) ما يحتاج منك — أسرار لا تمرّ عبر محادثة

> **لا تلصق أيًّا من هذه المفاتيح هنا ولا في أي محادثة.** أضفها من
> لوحة Vercel مباشرةً.

### أ) `SUPABASE_SERVICE_ROLE_KEY`

1. افتح: Supabase → Project Settings → **API Keys**
2. انسخ **`service_role`** (السرّي، وليس `publishable`)
3. Vercel → Settings → Environment Variables:
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Environments: **Production فقط**
   - Type: **Sensitive**

**بدونه:** المهام المجدولة وفحص صحة النظام يتوقّفان.

### ب) `CRON_SECRET`

ولّده على جهازك:

```bash
openssl rand -base64 48
```

أضفه في Vercel باسم `CRON_SECRET` — **Production فقط · Sensitive**.

**بدونه:** كل مسارات cron تُعطَّل ذاتيًا وترجع 503.

> ولّدتُه هنا ثم مُنع مروره عبر المحادثة — وهو المنع الصحيح: سرٌّ
> يمرّ في نصّ محادثة لم يعد سرًّا.

---

## ٣) Supabase — إعدادات المصادقة

Supabase → **Authentication → URL Configuration**:

**Site URL:**

```
https://nilemarket.online
```

**Redirect URLs** (أضف كل سطر):

```
https://nilemarket.online/**
https://www.nilemarket.online/**
```

> لا تضف `https://*.nilemarket.online/**`: الدخول يعيش على نطاق
> المنصّة وحده (انظر §٦).

### قوالب البريد

Supabase → Authentication → **Email Templates** — بدّل كل رابط
`{{ .SiteURL }}` ليشير إلى `https://nilemarket.online`. القوالب
المعنيّة: Confirm signup · Magic Link · Reset password · Change email.

### Google OAuth

Supabase → Authentication → Providers → Google، وفي **Google Cloud
Console** أضف إلى Authorized redirect URIs:

```
https://pxnaraiqqgmhnidbouyk.supabase.co/auth/v1/callback
```

وإلى Authorized JavaScript origins:

```
https://nilemarket.online
```

---

## ٤) Resend — مزوّد البريد

الكود ينادي `https://api.resend.com/emails` مباشرةً بلا SDK
(`src/lib/jobs/send-emails.ts`)، ويقرأ متغيّرين اثنين فقط.

### الخطوات

**1. أنشئ حسابًا** على [resend.com](https://resend.com).

**2. أضف النطاق:** Domains → Add Domain → `nilemarket.online`

> يمكن استعمال نطاق فرعي للإرسال مثل `mail.nilemarket.online` —
> وهو أفضل: مشكلة في سمعة الإرسال لا تمسّ نطاقك الأساسي.

**3. أضف سجلّات DNS** التي يعرضها Resend عند مزوّد نطاقك. ثلاثة أنواع:

| النوع | الغرض | ملاحظة |
|---|---|---|
| `MX` | استقبال ارتدادات الرسائل | القيمة من Resend |
| `TXT` (SPF) | من يحقّ له الإرسال باسمك | `v=spf1 include:...` |
| `TXT` (DKIM) | توقيع الرسائل | مفتاح طويل من Resend |

> **القيم تُولَّد لنطاقك تحديدًا — لا تنسخها من أي دليل.** خذها من
> صفحة النطاق في Resend حرفيًا.

**4. أضف DMARC** (لا يضيفه Resend تلقائيًا، ويحسّن الوصول كثيرًا):

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@nilemarket.online` |

ابدأ بـ`p=none` للمراقبة، ثم `p=quarantine` بعد أسبوعين من النظافة.

**5. انتظر التحقّق** (دقائق إلى ساعة) حتى تصير الحالة **Verified**.

**6. أنشئ مفتاح API:** API Keys → Create → صلاحية **Sending access**
فقط (لا Full access).

**7. أضف المتغيّرين في Vercel — Production · Sensitive:**

| Key | Value |
|---|---|
| `RESEND_API_KEY` | المفتاح من الخطوة ٦ |
| `EMAIL_FROM` | `سوق النيل <no-reply@nilemarket.online>` |

> `EMAIL_FROM` يُمرَّر كما هو في حقل `from`. يجب أن يكون نطاقه هو
> النطاق المتحقَّق في Resend، وإلا رفضت الرسالة.

**8. أعد النشر** — متغيّرات البيئة لا تسري على نشر قائم.

---

## ٥) التحقّق بعد الضبط

```bash
# النطاق يستجيب
curl -I https://nilemarket.online

# www يحوّل
curl -I https://www.nilemarket.online        # 308 → nilemarket.online

# سجلّات البريد موجودة
dig +short TXT nilemarket.online | grep spf
dig +short TXT resend._domainkey.nilemarket.online
dig +short TXT _dmarc.nilemarket.online
```

ثم من داخل المنتج:

- [ ] سجّل حسابًا جديدًا ⇒ **تصل رسالة التفعيل فعلًا**
- [ ] الرابط في الرسالة يبدأ بـ`https://nilemarket.online` لا `vercel.app`
- [ ] `/admin/health` يعرض البريد **سليم** لا «متدهور»
- [ ] أنشئ متجرًا ⇒ يفتح على `<slug>.nilemarket.online`

---

## ٦) 🔴 قرار معلّق: دخول العميل في المتجر

**وُجد أثناء هذا الضبط، ويحتاج قرارك.**

### الحقائق (مُثبتة بالفحص)

1. كوكي الجلسة **لا يُضبط له `domain`** ⇒ مقصور على المضيف. جلسة
   على `nilemarket.online` **لا تُرى** على `store.nilemarket.online`.
2. `/login` ليس ضمن `PLATFORM_ONLY` في `src/proxy.ts` ⇒ على نطاق
   متجر يُعاد كتابته إلى `/sites/<host>/login` وهو مسار غير موجود.
3. `ROUTES.md` يصف حساب العميل في المتجر بأنه **«اختياري»**، ولم يُبنَ.

### الأثر

المفضّلة (المرحلة ٤) تعمل في القاعدة بالكامل ومُختبَرة بـ٢٣ تأكيدًا،
لكن **العميل لا يستطيع تسجيل الدخول من داخل المتجر** — فالقلب يعرض
دائمًا حالة الزائر.

**أُصلح الآن:** كان الرابط يعطي 404؛ صار يقود إلى دخول المنصّة
بعنوان مطلق. لكن الجلسة لا تعبر إلى المتجر، فالمشكلة قائمة.

### الخيارات

| # | الخيار | الكلفة | المخاطرة |
|---|---|---|---|
| **أ** | بناء دخول العميل داخل المتجر (`/sites/[host]/login`) | متوسطة | منخفضة — كل متجر بجلسته |
| **ب** | توسيع نطاق الكوكي إلى `.nilemarket.online` | منخفضة | **عالية** — جلسة واحدة عبر كل المتاجر، و**لا تعمل مع النطاقات المخصّصة** إطلاقًا |
| **ج** | تأجيل المفضّلة للمسجَّلين على نطاق المنصّة فقط | صفر | تبقى الميزة غير مرئية عمليًا |

**توصيتي: (أ).** الخيار (ب) يكسر النطاقات المخصّصة — وهي ميزة مباعة
في الباقات — ويجعل جلسة واحدة تسري على متاجر تجّار مختلفين، وهو ما
يناقض نموذج العزل الذي بُني عليه المشروع كلّه.

**لم أنفّذ أيًّا منها**: هذا قرار معماري يمسّ المصادقة، وطلبك كان
ضبط النطاق والبريد.
