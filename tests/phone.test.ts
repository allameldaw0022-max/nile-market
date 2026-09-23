import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, localPhone } from '../src/lib/phone.ts';

test('الصور المحلّية الأربع تعطي رقمًا واحدًا', () => {
  const expected = '249912345678';
  for (const raw of [
    '0912345678', '912345678', '+249912345678', '00249912345678',
    '+249 91 234 5678', '0 912 345 678', '٠٩١٢٣٤٥٦٧٨'.replace(/[٠-٩]/g,
      (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))),
  ]) {
    assert.equal(normalizePhone(raw), expected, `فشل على: ${raw}`);
  }
});

test('★ مفتاح دولة أخرى لا يُلصق به 249', () => {
  // إلصاق مفتاح السودان برقم سعودي يفسده ولا يصلحه.
  assert.equal(normalizePhone('+966512345678'), '966512345678');
  assert.equal(normalizePhone('00201012345678'), '201012345678');
  assert.ok(!normalizePhone('+966512345678')!.startsWith('249'));
});

test('الفارغ وغير الصالح', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone('   '), null);
  assert.equal(normalizePhone('لا رقم هنا'), null);
});

test('★ التوحيد لا يكسر تتبّع الطلبات: آخر تسعة أرقام ثابتة', () => {
  // دالة التتبّع في القاعدة تطابق `right(digits, 9)` على الجانبين.
  const last9 = (v: string) => v.replace(/\D/g, '').slice(-9);
  for (const raw of ['0912345678', '+249912345678', '912345678']) {
    assert.equal(last9(normalizePhone(raw)!), last9(raw),
      `اختلف آخر تسعة على: ${raw}`);
  }
});

test('العرض المحلّي يعيد الصفر البادئ', () => {
  assert.equal(localPhone('249912345678'), '0912345678');
  assert.equal(localPhone('+966512345678'), '966512345678');
  assert.equal(localPhone(null), null);
});
