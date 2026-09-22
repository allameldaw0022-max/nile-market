import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, EMAIL_TEMPLATE_KEYS } from '../src/lib/email/templates.ts';

const BRAND = { siteName: 'نايل ماركت', siteUrl: 'https://nilemarket.online' };

test('البريد: قالب غير معروف يعيد null لا رسالة مبهمة', () => {
  assert.equal(renderEmail('nope', {}, BRAND), null);
});

test('البريد: كل قالب يعيد عنوانًا ونسخة HTML ونسخة نصية', () => {
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const out = renderEmail(key, {}, BRAND);
    assert.ok(out, `${key} لم يُصيَّر`);
    assert.ok(out.subject.length > 0, `${key}: عنوان فارغ`);
    assert.ok(out.html.includes('<html'), `${key}: ليس HTML`);
    assert.ok(out.html.includes('dir="rtl"'), `${key}: ليس RTL`);
    assert.ok(out.text.length > 0, `${key}: نسخة نصية فارغة`);
  }
});

test('★ البريد: اسم فيه ترميز يُهرَّب ولا يصير سكربتًا', () => {
  const out = renderEmail('order_created', {
    order_number: 'NM-00001',
    store_name: '<script>alert(1)</script>',
    customer: '"><img src=x onerror=alert(1)>',
    total: 1000,
  }, BRAND);
  assert.ok(out);
  // المعيار: لا وسم مفتوح من مدخل المستخدم. النص `onerror=` نفسه
  // غير ضار ما دام `<img` قد صار `&lt;img` فلا يُفسَّر كوسم.
  assert.ok(!out.html.includes('<script>'), 'سكربت غير مهرَّب في HTML');
  assert.ok(!out.html.includes('<img'), 'وسم صورة غير مهرَّب');
  assert.ok(out.html.includes('&lt;script&gt;'), 'لم يُهرَّب الترميز');
  assert.ok(out.html.includes('&lt;img'), 'لم يُهرَّب وسم الصورة');
});

test('البريد: المبلغ يُنسَّق بالعملة السودانية', () => {
  const out = renderEmail('order_created', {
    order_number: 'NM-1', store_name: 'متجر', customer: 'زبون', total: 20000,
  }, BRAND);
  assert.ok(out);
  assert.ok(out.text.includes('ج.س'), 'العملة لم تظهر');
});

test('البريد: مبلغ غير رقمي يظهر شرطة لا NaN', () => {
  const out = renderEmail('payout_status', {
    amount: 'ليس رقمًا', status_label: 'معتمد',
  }, BRAND);
  assert.ok(out);
  assert.ok(!out.text.includes('NaN'), 'ظهر NaN في الرسالة');
  assert.ok(out.text.includes('—'), 'لم تظهر الشرطة البديلة');
});

test('البريد: رابط الدعوة يظهر في نسخته النصية', () => {
  const out = renderEmail('team_invitation', {
    store_name: 'متجر', inviter: 'المالك', role_label: 'موظف طلبات',
    invite_url: 'https://nilemarket.online/invite/tok',
  }, BRAND);
  assert.ok(out);
  assert.ok(out.text.includes('https://nilemarket.online/invite/tok'));
});

test('★ cron: المقارنة بزمن ثابت ترفض الطول المختلف والقيمة المختلفة', async () => {
  const { timingSafeEqual } = await import('../src/lib/cron/guard.ts');
  assert.equal(timingSafeEqual('Bearer abc', 'Bearer abc'), true);
  assert.equal(timingSafeEqual('Bearer abc', 'Bearer abd'), false);
  assert.equal(timingSafeEqual('Bearer abc', 'Bearer ab'), false);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual('Bearer abc', ''), false);
});
