import type { NextConfig } from 'next';

/**
 * hostname الخاص بالتخزين يُشتق من متغير البيئة — لا يُثبَّت في الكود.
 * (إصلاح S8: كان مثبّتًا على مشروع Supabase قديم فتنكسر كل الصور.)
 */
const supabaseOrigin = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    // ★ البروتوكول والمنفذ يُشتقّان كذلك لا يُثبَّتان: مكدّس Supabase
    //   المحلّي يعمل على `http://127.0.0.1:54321`، وتثبيت `https` بلا
    //   منفذ كان يجعل كل صورة تُردّ بـ400 في التطوير المحلّي وحده.
    return { protocol: u.protocol.replace(':', '') as 'http' | 'https',
             hostname: u.hostname,
             port: u.port };
  } catch { return undefined; }
})();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    // ★★ ٣١ يومًا بدل ٤ ساعات (الافتراضي في Next 16).
    //
    // دليل Next يحذّر من رفعها لأنّه «لا آلية لإبطال التخزين، فقد
    // تحتاج تغيير `src` يدويًا». والتحذير **لا يسري هنا**: مسار كل
    // ملف مرفوع هو `stores/<id>/<purpose>/<uuid>.<ext>` بـuuid يُولَّد
    // لكل رفعة (0015)، والرفع بـ`upsert: false` — فلا يُعاد استعمال
    // مسار أبدًا، وصورةٌ جديدة تعني `src` جديدًا حتمًا.
    //
    // والمكسب على الأصل كبير: تحسين الصور أثقل عمل CPU في طبقة
    // التطبيق، وكان يُعاد كل ٤ ساعات لكل مقاس ولكل صيغة (avif+webp).
    minimumCacheTTL: 2678400,
    // ★ مُحسِّن الصور في Next 16 يحجب أيّ مضيف يُحلّ إلى IP خاصّ
    //   (حماية من SSRF). وهذا يمنع التطوير على مكدّس Supabase محلّي
    //   كلّيًا: كل صورة تُردّ بـ400. فالباب يُفتح بمتغيّر بيئة صريح
    //   وحده — لا يُضبط في الإنتاج، ولا قيمة افتراضية تفتحه سهوًا.
    dangerouslyAllowLocalIP:
      process.env.NEXT_ALLOW_LOCAL_IMAGE_HOST === '1',
    remotePatterns: supabaseOrigin
      ? [{ ...supabaseOrigin, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // ★ أيقونات PWA ثابتة المحتوى: تُطلب مع كل بيان تطبيق ومع كل
      //   تثبيت، وكانت تخرج بلا تخزين فتُجلب في كل مرّة.
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control',
                    value: 'public, max-age=31536000, immutable' }],
      },
      // ★ وعامل الخدمة **لا** يُخزَّن: نسخةٌ قديمة منه تُثبِّت سلوكًا
      //   قديمًا في متصفّح الزبون ولا سبيل لتحديثه.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
