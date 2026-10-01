'use server';
import 'server-only';
import { cookies } from 'next/headers';
import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, requireStoreAccess } from '@/lib/authz/guards';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { tenantTag, storeTag } from '@/lib/tenant/resolve';
import { REFERRAL_COOKIE } from '@/lib/referral';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { mediaUrl } from '@/lib/media/url';
import { normalizePhone } from '@/lib/phone';

const slugify = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/** فحص توفر الرابط أثناء الكتابة (Wizard). */
export async function checkSlug(slug: string): Promise<ActionResult<{ available: boolean }>> {
  try {
    await requireUser();
    const value = slugify(slug);
    if (value.length < 3) throw errors.validation('الرابط قصير جدًا');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'is_slug_available', { p_slug: value });
    if (error) throw fromPostgres(error);
    return ok({ available: Boolean(data) });
  } catch (err) {
    return actionError(err);
  }
}

/** الخطوة 1 — إنشاء المتجر. يقرأ كوكي الإحالة خادميًا (D19). */
export async function createStore(formData: FormData): Promise<ActionResult<{ storeId: string }>> {
  try {
    await requireUser();

    const name = String(formData.get('name') ?? '').trim();
    const slug = slugify(String(formData.get('slug') ?? '') || name);
    const businessType = String(formData.get('business_type') ?? '').trim();

    if (name.length < 2) throw errors.validation('اسم المتجر مطلوب', 'name');
    if (slug.length < 3) throw errors.validation('رابط المتجر مطلوب', 'slug');

    // ★ الإحالة تُقرأ من كوكي HttpOnly خادميًا — لا من الواجهة (D19)
    const jar = await cookies();
    const visitorToken = jar.get(REFERRAL_COOKIE)?.value ?? null;

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'create_store', {
      p_name: name, p_slug: slug,
      p_business_type: businessType || undefined,
      p_visitor_token: visitorToken ?? undefined,
    });

    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    return ok({ storeId: row.store_id });
  } catch (err) {
    return actionError(err);
  }
}

/** حفظ تلقائي لبيانات المتجر في أي خطوة. */
/** الحقول المسموح حفظها من الـWizard — قائمة بيضاء صريحة. */
export type StorePatch = {
  name?: string; business_type?: string | null; description?: string | null;
  logo_url?: string | null; banner_url?: string | null;
};
export type SettingsPatch = {
  whatsapp_number?: string | null; contact_email?: string | null;
  contact_phone?: string | null; cod_enabled?: boolean;
  bank_transfer_enabled?: boolean; bankak_enabled?: boolean;
  order_prefix?: string | null;
};

export async function saveStoreStep(
  storeId: string, step: string,
  store: StorePatch = {}, settings: SettingsPatch = {},
): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'settings:update');
    const supabase = await createClient();

    if (Object.keys(store).length > 0) {
      const { error: e1 } = await supabase
        .from('stores').update(store).eq('id', membership.storeId);
      if (e1) throw fromPostgres(e1);
    }
    if (Object.keys(settings).length > 0) {
      // ★ التوحيد هنا أيضًا لا في نموذج الإعدادات وحده: الـWizard
      // يكتب في نفس الجدول بمسار آخر، وترك أحدهما بلا توحيد يعني
      // أن الرقم يُخزَّن بصيغتين حسب المكان الذي كُتب فيه.
      const patch = {
        ...settings,
        ...('whatsapp_number' in settings
          ? { whatsapp_number: normalizePhone(settings.whatsapp_number) } : {}),
        ...('contact_phone' in settings
          ? { contact_phone: normalizePhone(settings.contact_phone) } : {}),
      };
      const { error: e2 } = await supabase
        .from('store_settings').update(patch).eq('store_id', membership.storeId);
      if (e2) throw fromPostgres(e2);
    }

    const { error: e3 } = await rpc(supabase, 'save_onboarding_step', {
      p_store_id: membership.storeId, p_step: step,
    });
    if (e3) throw fromPostgres(e3);

    updateTag(storeTag(membership.storeId, 'settings'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** الخطوة الأخيرة — النشر. التحقق يتم في القاعدة لا في الواجهة. */
export async function publishStore(
  storeId: string,
): Promise<ActionResult<{ published: boolean; missing: string[]; host: string | null }>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'settings:update');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'publish_store', {
      p_store_id: membership.storeId,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);

    const { data: domain } = await supabase
      .from('store_domains').select('hostname')
      .eq('store_id', membership.storeId).eq('is_primary', true).maybeSingle();

    if (domain?.hostname) updateTag(tenantTag(domain.hostname));
    updateTag(storeTag(membership.storeId, 'settings'));

    return ok({
      published: Boolean(row?.ok),
      missing: row?.missing ?? [],
      host: domain?.hostname ?? null,
    });
  } catch (err) {
    return actionError(err);
  }
}

/** منتجات خطوة «أول منتج» — قائمة قصيرة بصورة الغلاف والمخزون. */
export type OnboardingProduct = {
  id: string; name: string; price: number;
  quantity: number; imageUrl: string | null;
};

type ProductRow = {
  id: string; name: string; price: number;
  inventory: { quantity: number }[] | null;
  product_images: { sort_order: number; media_files: { bucket: string; path: string } | null }[] | null;
};

export async function listOnboardingProducts(
  storeId: string,
): Promise<ActionResult<OnboardingProduct[]>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('products')
      .select(
        'id, name, price, inventory(quantity), ' +
        'product_images(sort_order, media_files(bucket, path))',
      )
      .eq('store_id', membership.storeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((raw) => {
      const p = raw as unknown as ProductRow;
      const cover = [...(p.product_images ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)[0]?.media_files ?? null;
      return {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        quantity: (p.inventory ?? []).reduce((sum, i) => sum + i.quantity, 0),
        imageUrl: mediaUrl(cover),
      };
    }));
  } catch (err) {
    return actionError(err);
  }
}
