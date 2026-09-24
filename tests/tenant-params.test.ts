import { test } from 'node:test';
import assert from 'node:assert/strict';

const { decodeSlugParam } = await import('../src/lib/tenant/params.ts');

/**
 * هذا الاختبار يحرس عطلًا حقيقيًا وقع في الإنتاج: كل منتج عنوانه
 * بالعربية كان يعطي 404 عند الضغط عليه داخل المتجر. السبب أنّ
 * Next.js 16 يسلّم مكوّن الصفحة قيمة المعامل **مرمَّزة** بعد إعادة
 * كتابة الـproxy، فتُقارَن `%D8%B1...` بنصّ عربي في القاعدة.
 */
test('المعامل المرمَّز يُفكّ إلى نصّه العربي', () => {
  const slug = 'رول-اب-إعلاني-للدعاية';
  assert.equal(decodeSlugParam(encodeURIComponent(slug)), slug);
  assert.equal(decodeSlugParam(encodeURIComponent('نظارت-شمس-uv-400')), 'نظارت-شمس-uv-400');
  assert.equal(decodeSlugParam(encodeURIComponent('تصاميم-كــرت-بنكك')), 'تصاميم-كــرت-بنكك');
});

test('القيمة المفكوكة مسبقًا تمرّ كما هي — لا فكّ مزدوج', () => {
  const slug = 'رول-اب-إعلاني-للدعاية';
  assert.equal(decodeSlugParam(slug), slug);
  assert.equal(decodeSlugParam(decodeSlugParam(encodeURIComponent(slug))), slug);
  assert.equal(decodeSlugParam('qamis'), 'qamis');
  assert.equal(decodeSlugParam('uv-400'), 'uv-400');
});

test('الترميز التالف لا يرمي استثناءً — 404 لا 500', () => {
  assert.equal(decodeSlugParam('%'), '%');
  assert.equal(decodeSlugParam('%ZZ'), '%ZZ');
  assert.equal(decodeSlugParam('خصم-50%'), 'خصم-50%');
  assert.equal(decodeSlugParam('%E0%A4%A'), '%E0%A4%A');
});

/**
 * ★ شرطة مائلة داخل مقطع تغيّر بنية المسار المطابَق. لا نفكّها
 * مهما كان شكلها — وهذا حدّ أمني لا تحسين شكلي.
 */
test('%2F لا يُفكّ إلى شرطة مائلة', () => {
  assert.equal(decodeSlugParam('a%2Fb'), 'a%2Fb');
  assert.equal(decodeSlugParam('%2E%2E%2Fadmin'), '%2E%2E%2Fadmin');
  assert.equal(decodeSlugParam('%D8%B1%2F%D9%88'), '%D8%B1%2F%D9%88');
});
