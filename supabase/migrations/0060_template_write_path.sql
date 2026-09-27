-- =====================================================================
-- 0060 القالب: مسار كتابة واحد مدقَّق (إضافية · لا تمسّ بيانات)
--
-- ★★ ثغرةٌ وجدها تدقيق المرحلة الثالثة — لا تبديلٌ تلقائي (فُحِص:
-- لا مشغّل ولا دالّة أخرى تكتب العمود)، لكنّ `authenticated` يملك
-- `UPDATE` على **كل** أعمدة `store_settings`، ومنها `storefront_template`.
-- فعضوٌ بصلاحية `settings:update` يستطيع تغيير القالب بـPATCH مباشر على
-- PostgREST — والنتيجة نفسها تجاريًّا (قرار التاجر، ومتجره وحده بحكم
-- RLS)، لكنّها **تتخطّى سجلّ التدقيق** في `set_storefront_template`.
--
-- ولأنّ القاعدة المعلنة «القالب لا يتغيّر إلا بقرار التاجر من إعدادات
-- القالب أو بعملية إدارية **موثَّقة**»، يجب أن يبقى للتبديل مسارٌ واحد
-- يكتب سطرًا في `audit_logs` دائمًا.
--
-- ★ والطريقة هي نمط 0038 نفسه: منحٌ على مستوى العمود. وPostgres لا
-- يسمح بسحب عمود من منحٍ على مستوى الجدول، فيُسحب منح الجدول ثم
-- تُمنح الأعمدة الباقية صراحةً — وهي كل الأعمدة إلا القالب.
--
-- ★ ولا يتأثّر شيء قائم: فُحِص كل `update` على هذا الجدول في الشفرة
--   (إعدادات المتجر · التهيئة · السياسات · أقسام القالب) فلا واحد
--   منها يكتب `storefront_template`.
-- =====================================================================

revoke update on public.store_settings from authenticated;

grant update (
  store_id, whatsapp_number, contact_email, contact_phone, address,
  social_links, theme, cod_enabled, bank_transfer_enabled, bankak_enabled,
  low_stock_threshold, auto_hide_out_of_stock, order_prefix, seo, policies,
  notification_prefs, maintenance_mode, created_at, updated_at
) on public.store_settings to authenticated;

-- ★ ومنح `INSERT` على العمود يبقى خاملًا: لا سياسة `INSERT` على
--   `store_settings` أصلًا (فُحِص في الإنتاج: سياسات قراءة + سياسة
--   تحديث وحدها)، وRLS مع انعدام السياسة يمنع الإدراج. واختبارٌ يثبّت
--   هذا الشرط فلا تُضاف سياسة إدراج غدًا فتُفتح الثغرة من الباب الآخر.

-- ★ `set_storefront_template` تعمل بـSECURITY DEFINER (بدور المالك)،
--   فلا يمسّها سحب المنح — وهي المسار الوحيد الباقي، وتكتب التدقيق.
