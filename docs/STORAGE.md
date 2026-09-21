# 13. Storage Architecture

## 13.1 الـBuckets

| Bucket | عام؟ | المحتوى | الحد | الأنواع |
|---|---|---|---|---|
| `store-public` | ✅ عام للقراءة | شعارات · بانرات · صور المنتجات · صور التصنيفات | 5 MB/ملف | `image/jpeg,png,webp,avif` |
| `store-private` | ❌ خاص | إثباتات التحويل · ملفات الاستيراد · التصدير | 10 MB | `image/*, text/csv, application/vnd.openxmlformats-*` |
| `support-attachments` | ❌ خاص | مرفقات التذاكر | 10 MB | `image/*, application/pdf, text/plain` |
| `platform-public` | ✅ عام | أصول المنصة التسويقية | 5 MB | `image/*` |
| `avatars` | ✅ عام | صور المستخدمين | 2 MB | `image/*` |

## 13.2 تسمية المسارات (الملكية مشفَّرة في المسار)

```
store-public/        stores/{store_id}/logo/{uuid}.webp
                     stores/{store_id}/banners/{uuid}.webp
                     stores/{store_id}/products/{product_id}/{uuid}.webp
store-private/       stores/{store_id}/payment-proofs/{payment_id}/{uuid}.jpg
                     stores/{store_id}/imports/{job_id}/{uuid}.csv
                     stores/{store_id}/exports/{job_id}/{uuid}.csv
support-attachments/ tickets/{ticket_id}/{uuid}.{ext}
avatars/             users/{user_id}/{uuid}.webp
```

**القاعدة:** الجزء الثاني من المسار هو **معرّف المالك** دائمًا ⇒ سياسات
Storage تُبنى عليه بـ`(storage.foldername(name))[2]`.

**اسم الملف = UUID مولَّد خادميًا** — لا اسم المستخدم الأصلي إطلاقًا
(يمنع Path Traversal وتصادم الأسماء وتسريب معلومات).

## 13.3 سياسات الوصول

```sql
-- قراءة عامة لمتجر نشط فقط
create policy "store-public read" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'store-public'
  and exists (select 1 from stores s
              where s.id = ((storage.foldername(name))[2])::uuid
                and s.status = 'active' and s.deleted_at is null)
);

-- رفع: عضو المتجر بصلاحية فقط
create policy "store-public write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'store-public'
  and app.has_store_permission(((storage.foldername(name))[2])::uuid, 'products:update')
);

-- الخاص: لا anon إطلاقًا
create policy "store-private read" on storage.objects for select to authenticated
using (
  bucket_id = 'store-private'
  and ( app.has_store_permission(((storage.foldername(name))[2])::uuid, 'settings:view')
        or app.has_platform_permission('payments', 'view') )
);

-- مرفقات الدعم: صاحب التذكرة أو موظف دعم
create policy "support read" on storage.objects for select to authenticated
using (
  bucket_id = 'support-attachments'
  and exists (
    select 1 from support_tickets t
    where t.id = ((storage.foldername(name))[2])::uuid
      and ( t.requester_id = (select auth.uid())
            or app.has_platform_permission('support','view') )
  )
);
```

**إثباتات التحويل** (`payment-proofs`) حساسة: تُقدَّم عبر **Signed URL
قصير العمر (5 دقائق)** يولَّد خادميًا بعد فحص الصلاحية — لا رابط عام،
ولا حتى داخل لوحة Admin.

## 13.4 تدفق الرفع الآمن

```
العميل                        الخادم                         Storage
  │ اختيار ملف                    │                              │
  │ ضغط الصورة محليًا (WebP)      │                              │
  │──── POST /uploads/sign ──────▶│                              │
  │     {purpose, mime, size}     │ 1) requireStoreAccess         │
  │                               │ 2) فحص MIME ضمن القائمة       │
  │                               │ 3) فحص الحجم                  │
  │                               │ 4) assertWithinLimit(storage.mb)│
  │                               │ 5) توليد المسار (UUID)         │
  │                               │ 6) media_files(status=pending) │
  │◀──── {signedUrl, path} ───────│                              │
  │──────────── PUT مباشرة إلى Storage ─────────────────────────▶│
  │──── POST /uploads/complete ──▶│ 7) تحقق من الوجود والحجم الفعلي│
  │                               │ 8) فحص Magic Bytes (لا الامتداد)│
  │                               │ 9) media_files → ready         │
  │                               │10) Job: إنشاء أحجام responsive  │
```

**لماذا Signed URL ولا رفع عبر الخادم؟** لأن رفع 5MB عبر Vercel Function
يستهلك وقت تنفيذ ثمينًا على Free Tier بلا فائدة.

## 13.5 التحقق من الملفات

| الفحص | التنفيذ |
|---|---|
| MIME | قائمة بيضاء لكل `purpose` — **لا قائمة سوداء** |
| Magic Bytes | فحص توقيع الملف الفعلي خادميًا بعد الرفع ⇒ `.jpg` يخفي HTML يُرفض |
| الحجم | حد لكل bucket + حد إجمالي من الباقة |
| الأبعاد | حد أقصى 4000×4000 (منع Decompression Bomb) |
| SVG | **مرفوض تمامًا** في كل الـbuckets (ناقل XSS) |
| الملفات التنفيذية | مرفوضة بالمطلق |
| `Content-Disposition` | `attachment` لكل ما ليس صورة |
| الحصة | `sum(size_bytes)` لكل متجر مقابل `storage.mb` |

**الملف المشبوه** ⇒ `media_files.status='quarantined'` ولا يُقدَّم أبدًا.

## 13.6 تحسين الصور

| الطبقة | العمل |
|---|---|
| **قبل الرفع (العميل)** | تحويل إلى WebP + ضغط + تصغير إلى ≤1600px — **يقلل الشبكة على الإنترنت الضعيف قبل أن يبدأ الرفع** |
| **بعد الرفع (Job)** | توليد أحجام `thumb 200 · card 400 · detail 800 · og 1200×630` بـ`sharp` في Edge Function |
| **عند العرض** | `next/image` بـ`sizes` صحيحة + `loading="lazy"` + `placeholder="blur"` (LQIP مخزّن في `media_files`) + `priority` لأول صورة فقط |
| **الصيغة** | AVIF ثم WebP ثم JPEG (تفاوض المتصفح) |

> **ملاحظة تكلفة:** تحويلات صور Supabase ميزة مدفوعة، و**Vercel Hobby يحدّ
> تحسين الصور بعدد شهري**. لذلك التوليد المسبق للأحجام في Job هو
> المسار المعتمد — لا يعتمد على أي منهما.

## 13.7 دورة حياة الملف

`pending` → `ready` → (`quarantined`) → `deleted`

- الحذف **منطقي أولًا** (`deleted_at`) ⇒ لا تنكسر فاتورة أو طلب يشير إليه.
- Job ليلي يحذف فعليًا ما مضى على حذفه 30 يومًا وغير مرجعي.
- **إثباتات التحويل لا تُحذف مطلقًا** (سجل مالي — §34).
- مرفقات الدعم تتبع سياسة الاحتفاظ (**Q12**).
- حذف متجر ⇒ الملفات **تبقى** حتى انقضاء سياسة الاحتفاظ.
