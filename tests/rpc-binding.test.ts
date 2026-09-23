import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../src/lib/supabase/rpc.ts';

/**
 * ★ العطل الذي يحرسه هذا الاختبار:
 *
 *     const call = client.rpc as unknown as (…);
 *     await call(name, args);
 *
 * ينزع التابع عن كائنه. وجسم `rpc` في supabase-js هو
 * `return this.rest.rpc(...)`، ومع وحدات ES الصارمة يصير `this`
 * غير معرَّف ⇒ TypeError قبل خروج أي طلب إلى الشبكة. النتيجة كانت
 * «حدث خطأ غير متوقع» في كل واجهة تمرّ بهذا المساعد، ولا أثر لها
 * في سجلّ Supabase لأن الطلب لم يُرسَل أصلًا.
 *
 * العميل المزيّف هنا يقرأ `this` تمامًا كما يفعل العميل الحقيقي،
 * فالاختبار يفشل إن عاد أحدهم إلى نزع التابع.
 */
function fakeClient() {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rest: { tag: 'rest' },
    rpc(fn: string, args: unknown) {
      // نفس اعتماد supabase-js على `this`
      const rest = (this as { rest?: { tag: string } }).rest;
      if (!rest) throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      calls.push({ fn, args });
      return Promise.resolve({ data: true, error: null });
    },
  };
  return { client, calls };
}

test('rpc() يستدعي التابع مربوطًا بعميله — لا منزوعًا عنه', async () => {
  const { client, calls } = fakeClient();

  const res = await rpc(
    client as unknown as Parameters<typeof rpc>[0],
    'is_slug_available',
    { p_slug: 'متجر-تجريبي' },
  );

  assert.equal(res.error, null, 'لا خطأ');
  assert.equal(res.data, true, 'تعيد قيمة الدالة كما هي');
  assert.deepEqual(calls, [{ fn: 'is_slug_available', args: { p_slug: 'متجر-تجريبي' } }],
    '★ الطلب وصل فعلًا إلى طبقة الشبكة باسم الدالة ووسائطها');
});

test('العميل المزيّف يكشف النزع فعلًا — وإلا فالاختبار بلا قيمة', () => {
  const { client } = fakeClient();
  const detached = client.rpc;
  assert.throws(() => detached('x', {}), TypeError,
    'نزع التابع يجب أن يرمي، وإلا فالحارس لا يحرس شيئًا');
});
