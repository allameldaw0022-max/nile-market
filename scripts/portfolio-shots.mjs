/**
 * لقطات المنصة لملفّ الأعمال — من متصفّح كمبيوتر.
 *
 * يُشغَّل من جهازك لا من بيئة الوكيل: البيئة السحابية تحجب
 * `nilemarket.online`، والصور الحقيقية للمنتجات تعيش في Supabase
 * Storage فلا تظهر إلا من شبكة تصل إليها.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/portfolio-shots.mjs
 *
 * متغيّرات اختيارية:
 *   OUT=./shots            مجلّد الحفظ
 *   STORE=one-shop         المتجر المعروض
 *   WIDTH=1440 HEIGHT=900  مقاس نافذة سطح المكتب
 *   SESSION=./session.json جلسة محفوظة لالتقاط اللوحات (انظر أسفله)
 *   PROTO=http              للتجربة على نسخة محلية
 *
 * للقطات لوحة التحكّم (تحتاج تسجيل دخول مرّة واحدة):
 *   npx playwright open --save-storage=session.json https://nilemarket.online/login
 *   # سجّل دخولك في النافذة ثم أغلقها
 *   SESSION=./session.json node scripts/portfolio-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ROOT    = process.env.ROOT_DOMAIN ?? 'nilemarket.online';
const STORE   = process.env.STORE ?? 'one-shop';
const OUT     = process.env.OUT ?? './shots';
const WIDTH   = Number(process.env.WIDTH ?? 1440);
const HEIGHT  = Number(process.env.HEIGHT ?? 900);
const SESSION = process.env.SESSION ?? null;
const PROTO   = process.env.PROTO ?? 'https';

const platform = `${PROTO}://${ROOT}`;
const store    = `${PROTO}://${STORE}.${ROOT}`;

/** `full: true` يلتقط الصفحة كاملة؛ وإلا فالنافذة وحدها (أنسب للغلاف). */
const PUBLIC_PAGES = [
  ['01-platform-home',    `${platform}/`,                 true],
  ['02-platform-pricing', `${platform}/pricing`,           true],
  ['03-platform-partners',`${platform}/partners`,          true],
  ['04-store-home-fold',  `${store}/`,                     false],
  ['05-store-home',       `${store}/`,                     true],
  ['06-store-products',   `${store}/products`,             true],
  ['07-store-cart',       `${store}/cart`,                 false],
  ['08-store-login',      `${store}/login`,                false],
];

const PRIVATE_PAGES = [
  ['20-dashboard',          `${platform}/dashboard`,           false],
  ['21-dashboard-products', `${platform}/dashboard/products`,  true],
  ['22-dashboard-orders',   `${platform}/dashboard/orders`,    true],
  ['23-dashboard-settings', `${platform}/dashboard/settings`,  true],
];

async function shoot(ctx, [name, url, full]) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    // الخطوط والصور الكسولة: ننتظرها حتى لا تخرج اللقطة بنصّ احتياطي
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 600));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 400));
    }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    console.log(`✓ ${name}  ${res?.status() ?? '—'}  ${url}`);
  } catch (err) {
    console.log(`✗ ${name}  ${url}\n    ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

// ★ `PW_HOST_RULES` للتجربة المحلية وحدها: يوجّه الدومين إلى
// 127.0.0.1 حتى يُختبر السكربت بلا نشر. لا أثر له في الاستعمال العادي.
const browser = await chromium.launch(process.env.PW_HOST_RULES
  ? { args: [`--host-resolver-rules=MAP *.${ROOT.split(':')[0]} 127.0.0.1, MAP ${ROOT.split(':')[0]} 127.0.0.1`] }
  : {});
await mkdir(OUT, { recursive: true });

// ★ deviceScaleFactor: 2 ⇒ صور بدقّة مضاعفة تصلح للعرض والطباعة
const base = { viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2,
               locale: 'ar-SD' };

const anon = await browser.newContext(base);
for (const p of PUBLIC_PAGES) await shoot(anon, p);
await anon.close();

if (SESSION && existsSync(SESSION)) {
  const signedIn = await browser.newContext({ ...base, storageState: SESSION });
  for (const p of PRIVATE_PAGES) await shoot(signedIn, p);
  await signedIn.close();
} else {
  console.log('\n— لوحة التحكّم لم تُلتقط: لا جلسة محفوظة.');
  console.log('  npx playwright open --save-storage=session.json ' +
              `https://${ROOT}/login`);
  console.log('  ثم: SESSION=./session.json node scripts/portfolio-shots.mjs');
}

await browser.close();
console.log(`\nاللقطات في ${OUT}`);
