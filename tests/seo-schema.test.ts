import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  breadcrumbSchema, productSchema, storeSchema,
} from '../src/lib/seo/schema.ts';

test('سعر المنتج يُكتب بخانتين عشريتين نصًّا كما تشترط schema.org', () => {
  const s = productSchema({
    name: 'قميص', price: 20000, url: 'https://x.test/p', storeName: 'متجر',
    inStock: true, canBuy: true,
  });
  const offers = s.offers as Record<string, unknown>;
  assert.equal(offers.price, '20000.00');
  assert.equal(offers.priceCurrency, 'SDG');
});

test('★ متجر منتهي الاشتراك لا يُعلن منتجه «متوفّرًا» (D14)', () => {
  const s = productSchema({
    name: 'قميص', price: 100, url: 'https://x.test/p', storeName: 'متجر',
    inStock: true, canBuy: false,
  });
  const offers = s.offers as Record<string, unknown>;
  assert.equal(offers.availability, 'https://schema.org/PreOrder');
});

test('نفاد المخزون يُعلن بصدق', () => {
  const s = productSchema({
    name: 'قميص', price: 100, url: 'https://x.test/p', storeName: 'متجر',
    inStock: false, canBuy: true,
  });
  const offers = s.offers as Record<string, unknown>;
  assert.equal(offers.availability, 'https://schema.org/OutOfStock');
});

test('★ ما لا نعرفه لا يُكتب: بلا وصف أو sku لا يظهر المفتاح أصلًا', () => {
  const s = productSchema({
    name: 'قميص', price: 100, url: 'https://x.test/p', storeName: 'متجر',
    inStock: null, canBuy: true, description: null, sku: null, image: null,
  });
  assert.equal('description' in s, false);
  assert.equal('sku' in s, false);
  assert.equal('image' in s, false);
});

test('★★ اسم منتج فيه وسم script لا يكسر وسم ld+json', () => {
  const s = productSchema({
    name: '</script><img src=x onerror=alert(1)>',
    price: 100, url: 'https://x.test/p', storeName: 'متجر',
    inStock: null, canBuy: true,
  });
  // نفس التهريب الذي يطبّقه مكوّن JsonLd
  const rendered = JSON.stringify(s).replace(/</g, '\\u003c');
  assert.equal(rendered.includes('</script>'), false);
  assert.equal(rendered.includes('<img'), false);
  assert.ok(rendered.includes('\\u003c/script'));
});

test('مسار الفتات يرقّم العناصر من واحد ويبني روابط مطلقة', () => {
  const s = breadcrumbSchema('shop.test', [
    { name: 'الرئيسية', path: '/' },
    { name: 'المنتجات', path: '/products' },
  ]);
  const items = s.itemListElement as Record<string, unknown>[];
  assert.equal(items.length, 2);
  assert.equal(items[0].position, 1);
  assert.equal(items[1].item, 'https://shop.test/products');
});

test('بحث المتجر يُعلَن بقالب رابط صحيح', () => {
  const s = storeSchema({ name: 'متجر', host: 'shop.test' });
  const action = s.potentialAction as Record<string, unknown>;
  const target = action.target as Record<string, unknown>;
  assert.equal(target.urlTemplate, 'https://shop.test/search?q={q}');
});
