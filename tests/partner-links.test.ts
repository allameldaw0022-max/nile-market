import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'nilemarket.online';
process.env.NEXT_PUBLIC_SITE_URL = 'https://nilemarket.online';

const { serialFromHost, partnerShortLink, partnerLegacyLink } =
  await import('../src/lib/partners/links.ts');

/**
 * الرابط القصير يعيش على حدّ حسّاس: مضيف المتجر ومضيف الشريك
 * متشابهان للعين (`5.nilemarket.online` و`5nilemarket.online`)
 * ومختلفان تمامًا في المعنى. خطأ هنا يوجّه زبون متجر إلى صفحة
 * إحالة — أو أسوأ: يبتلع مضيف متجر فيظهر 404.
 */
test('رقم الشريك يُستخرج من المضيف القصير وحده', () => {
  assert.equal(serialFromHost('1nilemarket.online'), 1);
  assert.equal(serialFromHost('42nilemarket.online'), 42);
  assert.equal(serialFromHost('1NILEMARKET.ONLINE'), 1, 'حالة الأحرف لا تهم');
  assert.equal(serialFromHost('1nilemarket.online:3000'), 1, 'المنفذ يُتجاهل');
});

test('★★ مضيف المنصة نفسه ليس رابط شريك', () => {
  assert.equal(serialFromHost('nilemarket.online'), null);
  assert.equal(serialFromHost('www.nilemarket.online'), null);
});

test('★★★ ونطاق فرعي لمتجر ليس رابط شريك', () => {
  // الفارق نقطة واحدة — وهي كل الفرق بين متجر وشريك
  assert.equal(serialFromHost('5.nilemarket.online'), null);
  assert.equal(serialFromHost('shop.nilemarket.online'), null);
  assert.equal(serialFromHost('my-store.nilemarket.online'), null);
});

test('★★ ودومين مخصص لا يُخطف', () => {
  assert.equal(serialFromHost('1example.com'), null);
  assert.equal(serialFromHost('example.com'), null);
});

test('★ والصفر أو ما ليس رقمًا مرفوض', () => {
  assert.equal(serialFromHost('0nilemarket.online'), null);
  assert.equal(serialFromHost('abcnilemarket.online'), null);
  assert.equal(serialFromHost('1anilemarket.online'), null);
  assert.equal(serialFromHost('-1nilemarket.online'), null);
});

test('الرابط القصير في وضع المسار يعمل بلا إعداد خارجي', () => {
  delete process.env.NEXT_PUBLIC_PARTNER_LINK_MODE;
  assert.equal(partnerShortLink(7), 'https://nilemarket.online/r/7');
  assert.equal(partnerShortLink(null), null);
});

test('وفي وضع الدومين يطابق المضيف الذي يفهمه الـproxy', () => {
  process.env.NEXT_PUBLIC_PARTNER_LINK_MODE = 'domain';
  const link = partnerShortLink(7);
  assert.equal(link, 'https://7nilemarket.online');
  // ★ الجوهري: ما يُعرض على الشريك هو ما يفهمه الـproxy
  assert.equal(serialFromHost(new URL(link!).host), 7);
  delete process.env.NEXT_PUBLIC_PARTNER_LINK_MODE;
});

test('★ والرابط الطويل يبقى كما هو — لا يُكسر رابط منشور', () => {
  assert.equal(partnerLegacyLink('ABC123'),
               'https://nilemarket.online/?ref=ABC123');
});
