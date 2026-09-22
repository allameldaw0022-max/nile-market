/*
 * عامل الخدمة — نايل ماركت.
 *
 * سياق التشغيل: إنترنت السودان متقطّع وبطيء، والهدف أن تُفتح الصفحة
 * التي زارها الزبون قبل قليل دون انتظار الشبكة.
 *
 * ★ لا يُخزَّن شيء يخصّ حسابًا: المصادقة والسلة والطلبات والدفع تمرّ
 * بالشبكة دائمًا. تخزين ردّ مُصادَق عليه في ذاكرة مشتركة يجعل جهازًا
 * واحدًا يعرض بيانات زائر آخر.
 *
 * ★ كل الكتابات على الطلبات غير GET تمرّ مباشرة: لا تخزين ولا إعادة
 * إرسال صامتة — دفعة تُرسَل مرتين ليست ميزة دون اتصال.
 *
 * ★★ `no-store` يُحترم حرفيًا. صفحات المتجر كلّها تقرأ الكوكيز، فتردّ
 * Next بـ`Cache-Control: private, no-store`. تخزينها كان يكتب صفحة
 * مُصيَّرة لزبون مسجَّل — باسمه وسلّته — في ذاكرة يتقاسمها كل من
 * يستخدم الجهاز، وتُعرض بعد خروجه. قائمة المسارات الممنوعة أدناه
 * تبقى حزامًا ثانيًا، لكن الحاجز الحقيقي هو ترويسة الرد نفسها.
 */
const VERSION = 'nm-v2';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

const OFFLINE_URL = '/offline';

/** مسارات لا تُخزَّن أبدًا — خاصة أو تتغيّر بتغيّر الجلسة. */
const NEVER_CACHE = [
  '/api/', '/auth/', '/login', '/signup', '/reset-password', '/forgot-password',
  '/cart', '/checkout', '/order', '/orders/', '/account', '/dashboard',
  '/admin', '/partner', '/support',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isPrivate(url) {
  return NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix));
}

function isAsset(url) {
  return url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/icons/')
    || /\.(?:css|js|woff2?|png|jpe?g|webp|avif|svg|ico)$/.test(url.pathname);
}

/** أصل واحد فقط: لا نلمس طلبات Supabase ولا أي طرف ثالث. */
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/**
 * هل يُسمح بتخزين هذا الرد؟
 *
 * الرد الخاص بجلسة يحمل `no-store` (أو `private`)، وتخزينه في ذاكرة
 * مشتركة يسرّبه لمن يأتي بعده على الجهاز نفسه.
 */
function mayStore(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const cc = (response.headers.get('cache-control') || '').toLowerCase();
  if (cc.includes('no-store') || cc.includes('private')) return false;
  if (response.headers.get('set-cookie')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url) || isPrivate(url)) return;

  // الأصول ذات البصمة لا تتغيّر تحت نفس الاسم ⇒ من الذاكرة أولًا
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (mayStore(res)) {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })),
    );
    return;
  }

  // الصفحات: الشبكة أولًا ثم آخر نسخة، وصفحة «دون اتصال» أخيرًا.
  // العكس كان سيعرض سعرًا قديمًا لمنتج تغيّر سعره.
  //
  // عمليًا صفحات المتجر كلها `no-store`، فلا تُخزَّن ويبقى البديل دون
  // اتصال هو صفحة «لا يوجد اتصال». هذا هو السلوك الصحيح: صفحة مخزَّنة
  // لزبون آخر أسوأ من صفحة اعتذار.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (mayStore(res)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request)
          .then((hit) => hit || caches.match(OFFLINE_URL))
          .then((hit) => hit || new Response('دون اتصال', {
            status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' },
          }))),
    );
  }
});

/** تحديث فوري حين تنشر الواجهة نسخة جديدة. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
