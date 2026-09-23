# الوثائق القانونية — نسخة المراجعة

**المصدر الحيّ هو قاعدة البيانات**، لا هذه الملفات:
`platform_settings.legal` بمفاتيح `terms · privacy · subscription · cancellation`،
وتُحرَّر من `/admin/settings` وتُعرض على `/legal/<slug>`.

هذه الملفات نسخة مطابقة رُفعت بتاريخ **٢٠٢٦-٠٩-٢٣**، غرضها المراجعة وتتبّع
التغيير في Git. أي تعديل من لوحة الإدارة لن ينعكس هنا تلقائيًا — فإن عدّلت
النصّ فحدّث الملف المقابل في الدفعة نفسها، وإلا افترض أن القاعدة هي الأصحّ.

للتحقّق من التطابق:

```sql
select slug, md5(body) from (
  select (public.legal_document('terms')).*        union all
  select (public.legal_document('privacy')).*      union all
  select (public.legal_document('subscription')).* union all
  select (public.legal_document('cancellation')).*) t;
```

```bash
for f in terms privacy subscription cancellation; do
  python3 -c "
import hashlib
t=open('docs/legal/$f.txt',encoding='utf-8').read().strip()
print('$f', hashlib.md5(t.encode()).hexdigest())"
done
```

## قيد الصياغة

الصفحة تعرض النصّ بـ`whitespace-pre-line` **بلا تفسير HTML ولا Markdown**.
فالعناوين مرقّمة نصًّا (`١) …`) والفقرات تُفصل بسطر فارغ. كتابة `##` أو `**`
ستظهر حرفيًّا للزائر.

## ما لم يُكتب عمدًا

- **لا أسعار.** أسعار الباقات المدفوعة غير مضبوطة في القاعدة
  (`plans.price_configured_at is null`)، والنصّ يحيل إلى `/pricing` وحدها.
- **لا بريد تواصل.** `platform_settings.support_email` فارغ، فالنصّ يحيل إلى
  صفحة الدعم لا إلى بريد مخترع.
- **لا اسم كيان تجاري ولا سجل تجاري.** لم يُعطَ، ولا يُخترع.

## ما يحتاج قرار المالك قبل الإطلاق التجاري

1. **مراجعة محامٍ.** هذه مسوّدات مبنية على سلوك النظام الفعلي، لا استشارة قانونية.
2. **القانون الواجب التطبيق** — كُتب «قوانين جمهورية السودان» استنادًا إلى
   العملة (SDG) والتوقيت (Africa/Khartoum). يُؤكَّد أو يُغيَّر.
3. **قناة تواصل للمشتري الضيف.** `/support` تتطلّب تسجيل دخول، والمشتري
   بالدفع عند الاستلام قد لا يملك حسابًا. ضبط `support_email` يسدّ الفجوة.
4. **اسم الكيان القانوني** إن وُجد، ليُذكر في الشروط.
