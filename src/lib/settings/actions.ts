'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { normalizePhone } from '@/lib/phone';
import { storeTag, tenantTag } from '@/lib/tenant/resolve';

/**
 * إعدادات المتجر.
 *
 * الحقول محدَّدة بقائمة بيضاء صريحة: النموذج لا يستطيع تمرير عمود لم
 * يُذكر هنا (مثل `status` أو `owner_id`)، وحارس الأعمدة في القاعدة
 * يرفضه أيضًا لو وصل.
 */
export type StoreProfileInput = {
  storeId: string;
  name: string;
  businessType?: string | null;
  description?: string | null;
  whatsapp?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  city?: string | null;
  addressLine?: string | null;
  orderPrefix?: string | null;
  lowStockThreshold?: number | null;
  codEnabled: boolean;
  bankTransferEnabled: boolean;
  bankakEnabled: boolean;
};

export async function saveStoreProfile(
  input: StoreProfileInput,
): Promise<ActionResult> {
  try {
    const name = input.name.trim();
    if (name.length < 2) throw errors.validation('اسم المتجر مطلوب', 'name');
    if (name.length > 100) throw errors.validation('اسم المتجر طويل جدًا', 'name');

    const whatsapp = (input.whatsapp ?? '').replace(/\D/g, '');
    if (whatsapp && whatsapp.length < 9)
      throw errors.validation('رقم واتساب غير صحيح', 'whatsapp');

    if (!input.codEnabled && !input.bankTransferEnabled && !input.bankakEnabled)
      throw errors.validation('فعّل طريقة دفع واحدة على الأقل', 'payments');

    const prefix = (input.orderPrefix ?? '').trim().toUpperCase();
    if (prefix && !/^[A-Z0-9]{1,6}$/.test(prefix))
      throw errors.validation(
        'بادئة رقم الطلب: حروف لاتينية وأرقام حتى 6 خانات', 'orderPrefix');

    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const supabase = await createClient();

    const { error: storeError } = await supabase
      .from('stores')
      .update({
        name,
        business_type: input.businessType?.trim() || null,
        description: input.description?.trim() || null,
      })
      .eq('id', membership.storeId);
    if (storeError) throw fromPostgres(storeError);

    const { error: settingsError } = await supabase
      .from('store_settings')
      .update({
        whatsapp_number: normalizePhone(whatsapp),
        contact_phone: normalizePhone(input.contactPhone),
        contact_email: input.contactEmail?.trim() || null,
        address: {
          city: input.city?.trim() || null,
          line: input.addressLine?.trim() || null,
        },
        order_prefix: prefix || null,
        low_stock_threshold: Math.max(0, Math.trunc(input.lowStockThreshold ?? 5)),
        cod_enabled: input.codEnabled,
        bank_transfer_enabled: input.bankTransferEnabled,
        bankak_enabled: input.bankakEnabled,
      })
      .eq('store_id', membership.storeId);
    if (settingsError) throw fromPostgres(settingsError);

    // وسم المستأجر يُبطَل أيضًا: اسم المتجر يظهر في كل صفحة من صفحاته
    const { data: domain } = await supabase
      .from('store_domains').select('hostname')
      .eq('store_id', membership.storeId).eq('is_primary', true).maybeSingle();
    if (domain?.hostname) updateTag(tenantTag(domain.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));

    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * غلاف المتجر.
 *
 * ★ الرابط يصل من المتصفّح، فلا يُقبل إلا ملفًا في الدلو العام لهذا
 * المشروع — بالضبط كشعار البنك (`cleanLogo` أدناه). بدون ذلك كان
 * يمكن حقن رابط خارجي يُحمَّل في **كل** صفحة من صفحات المتجر:
 * تتبّعٌ لكل زائر في أحسن الأحوال، وصورة مسيئة باسم التاجر في
 * أسوئها.
 *
 * ★ والرفع نفسه مرّ بـ`prepare_upload` التي تفحص `products:update`
 * على هذا المتجر وحده، فالمسار مغلق من طرفيه.
 */
export async function saveStoreCover(input: {
  storeId: string; url: string | null;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const url = cleanPublicUrl(input.url ?? undefined, 'رابط الغلاف');

    const supabase = await createClient();
    const { error } = await supabase
      .from('stores')
      .update({ banner_url: url ?? null })
      .eq('id', membership.storeId);
    if (error) throw fromPostgres(error);

    // الغلاف يظهر في افتتاحية المتجر، فوسم المستأجر يُبطَل فورًا
    const { data: domain } = await supabase
      .from('store_domains').select('hostname')
      .eq('store_id', membership.storeId).eq('is_primary', true).maybeSingle();
    if (domain?.hostname) updateTag(tenantTag(domain.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));

    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export type BankAccount = {
  bank: string; account: string; holder?: string;
  /** رابط شعار البنك في `store-public` — اختياري. */
  logo?: string;
};

/**
 * لا يُقبل إلا رابط ملف في الدلو العام لهذا المشروع.
 *
 * ★ القيمة تصل من المتصفح، فلو قُبلت كما هي لأمكن حقن رابط خارجي
 * يُحمَّل في صفحة تعليمات الدفع — تتبّعٌ للزبون في أحسن الأحوال،
 * وصورة مضلِّلة عن حساب بنكي في أسوئها.
 */
function cleanPublicUrl(
  value: string | undefined, label = 'رابط الشعار',
): string | undefined {
  const url = value?.trim();
  if (!url) return undefined;
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/store-public/`;
  if (!prefix.startsWith('https://') || !url.startsWith(prefix)) {
    throw errors.validation(`${label} غير صالح`);
  }
  if (url.length > 500) throw errors.validation(`${label} طويل جدًا`);
  return url;
}

const cleanLogo = (value: string | undefined) => cleanPublicUrl(value);

/**
 * الحسابات البنكية. تُخزَّن في `store_payment_settings` المفصول، ولا
 * يقرؤه إلا من يملك `settings:banking` — لأن سياسات RLS تعمل على
 * الصف لا على العمود.
 */
export async function saveBankAccounts(input: {
  storeId: string; accounts: BankAccount[]; bankakNumber?: string | null;
}): Promise<ActionResult> {
  try {
    if (input.accounts.length > 10)
      throw errors.validation('الحد الأقصى 10 حسابات');

    const clean = input.accounts
      .map((a) => ({
        bank: a.bank.trim(),
        account: a.account.trim(),
        holder: a.holder?.trim() || undefined,
        logo: cleanLogo(a.logo),
      }))
      .filter((a) => a.bank || a.account);

    for (const account of clean) {
      if (!account.bank) throw errors.validation('اسم البنك مطلوب لكل حساب');
      if (!account.account) throw errors.validation('رقم الحساب مطلوب لكل حساب');
      if (account.account.length > 40)
        throw errors.validation('رقم الحساب طويل جدًا');
    }

    const { membership } = await requireStoreAccess(input.storeId, 'settings:banking');
    const supabase = await createClient();

    const { error } = await supabase
      .from('store_payment_settings')
      .update({
        bank_accounts: clean,
        bankak_number: input.bankakNumber?.replace(/\s/g, '') || null,
      })
      .eq('store_id', membership.storeId);
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'settings'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** نصوص السياسات التي تظهر في صفحات المتجر. */
export async function saveStorePolicies(input: {
  storeId: string;
  policies: { shipping?: string; returns?: string; privacy?: string; terms?: string };
}): Promise<ActionResult> {
  try {
    const entries = Object.entries(input.policies);
    for (const [, text] of entries) {
      if ((text ?? '').length > 8000)
        throw errors.validation('النص طويل جدًا — الحد 8000 حرف');
    }

    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const supabase = await createClient();

    const policies = Object.fromEntries(
      entries.map(([key, text]) => [key, (text ?? '').trim()])
        .filter(([, text]) => text !== ''),
    );

    const { error } = await supabase
      .from('store_settings').update({ policies })
      .eq('store_id', membership.storeId);
    if (error) throw fromPostgres(error);

    const { data: domain } = await supabase
      .from('store_domains').select('hostname')
      .eq('store_id', membership.storeId).eq('is_primary', true).maybeSingle();
    if (domain?.hostname) updateTag(tenantTag(domain.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));

    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
