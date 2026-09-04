# سوق النيل (Nile Market)

منصة تجارة إلكترونية سودانية مستقلة (Marketplace) — تجار متعددون، متاجر
مستقلة، عملاء، ومسوّقو منتجات.

## التقنيات (Tech Stack)

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Supabase** — قاعدة البيانات، المصادقة (Auth)، والتخزين (Storage)
- دعم كامل للغة العربية RTL، وتصميم Mobile First متجاوب
- الهوية البصرية: أزرق (`#1E4FA3`) + ذهبي (`#D4AF37`)

## هيكلة المشروع

```
src/
  app/                 صفحات المشروع (Next.js App Router):
                       العميل، لوحة التاجر (/seller)، لوحة الإدارة (/admin)
  components/          مكوّنات واجهة قابلة لإعادة الاستخدام
  lib/                 عميل Supabase، الاستعلامات، دوال مساعدة
supabase/
  migrations/          ملفات ترحيل قاعدة البيانات (SQL) — المصدر الوحيد
                       المعتمد لأي تعديل على المخطط
```

## التشغيل محليًا

```bash
npm install
cp .env.example .env.local   # ثم عبّئ القيم من Supabase Dashboard → Settings → API
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000) في المتصفح.

### أوامر أخرى

```bash
npm run build   # بناء نسخة الإنتاج
npm run start   # تشغيل نسخة الإنتاج
npm run lint    # فحص الكود
```

## Production

منشور على [Vercel](https://vercel.com)، ومربوط مباشرة بهذا المستودع
(فرع `main`).
