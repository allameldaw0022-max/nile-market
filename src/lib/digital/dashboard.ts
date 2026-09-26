'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStoreAccess } from '@/lib/authz/guards';
import { fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { storeTag, tenantTag } from '@/lib/tenant/resolve';

/**
 * أفعال التاجر على القالب الرقمي.
 *
 * ★★ كل فعل هنا يستدعي دالّة قاعدة تفرض الصلاحية بنفسها — والتحقّق
 * في هذه الطبقة رسالةٌ مبكرة للمستخدم لا حاجزٌ أمني. الحاجز في
 * القاعدة، ولو استُدعيت الدوال مباشرةً عبر REST لرُدّت.
 *
 * ★★ وإبطال الوسوم: تعديل القالب أو الأقسام أو البنرات أو التصنيفات
 * يُبطل `store:<id>:settings` **و**`tenant:<host>` — وإلا انتظر التاجر
 * دورة تخزين كاملة قبل أن يرى تعديله في متجره.
 */

/** مضيفات المتجر — لإبطال وسم المستأجر عليها كلّها لا على واحد. */
async function storeHosts(storeId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('store_domains').select('hostname')
    .eq('store_id', storeId).in('status', ['active', 'ssl_active']);
  return (data ?? []).map((d) => d.hostname);
}

async function invalidate(storeId: string, resources: string[] = ['settings']) {
  for (const r of resources) updateTag(storeTag(storeId, r));
  for (const h of await storeHosts(storeId)) updateTag(tenantTag(h));
}

export async function switchTemplate(input: {
  storeId: string; template: 'classic' | 'digital';
}): Promise<ActionResult<{ template: string }>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'set_storefront_template', {
      p_store_id: membership.storeId, p_template: input.template,
    });
    if (error) throw fromPostgres(error);
    await invalidate(membership.storeId, ['settings', 'products']);
    return ok({ template: typeof data === 'string' ? data : input.template });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * إظهار/إخفاء أقسام الرئيسية.
 *
 * ★ الترتيب **ليس** ضمن ما يُحفظ: لا يملكه التاجر، وهو ثابت في
 * المكوّن. وما يُحفظ خريطة بوليانات في `store_settings.theme.sections`
 * — فلا مفاتيح خارجية ولا بيانات مِلكية داخل jsonb.
 */
export async function saveSections(input: {
  storeId: string;
  sections: Record<'hero' | 'promo' | 'categories' | 'featured' | 'offers', boolean>;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const supabase = await createClient();

    const { data: row } = await supabase.from('store_settings')
      .select('theme').eq('store_id', membership.storeId).maybeSingle();
    const theme = (row?.theme ?? {}) as Record<string, unknown>;

    // قائمة بيضاء صريحة: لا يُكتب في `theme` إلا المفاتيح الخمسة
    const clean = {
      hero: input.sections.hero !== false,
      promo: input.sections.promo !== false,
      categories: input.sections.categories !== false,
      featured: input.sections.featured !== false,
      offers: input.sections.offers !== false,
    };

    const { error } = await supabase.from('store_settings')
      .update({ theme: { ...theme, sections: clean } })
      .eq('store_id', membership.storeId);
    if (error) throw fromPostgres(error);

    await invalidate(membership.storeId);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function seedStarter(storeId: string): Promise<ActionResult<{
  categories: number; products: number; banners: number;
}>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:create');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'seed_digital_starter', {
      p_store_id: membership.storeId,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    await invalidate(membership.storeId, ['settings', 'products']);
    return ok({
      categories: row?.categories_added ?? 0,
      products: row?.products_added ?? 0,
      banners: row?.banners_added ?? 0,
    });
  } catch (err) {
    return actionError(err);
  }
}

// ═══════════════════════ البنرات ═══════════════════════

export type BannerRow = {
  id: string; slot: 'hero' | 'promo';
  title: string | null; description: string | null;
  ctaLabel: string | null; ctaHref: string | null;
  mediaFileId: string | null; isVisible: boolean; sortOrder: number;
};

export async function listBanners(storeId: string): Promise<ActionResult<BannerRow[]>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'settings:view');
    const supabase = await createClient();
    const { data, error } = await supabase.from('store_theme_banners')
      .select('id, slot, title, description, cta_label, cta_href, media_file_id, is_visible, sort_order')
      .eq('store_id', membership.storeId).is('deleted_at', null)
      .order('slot').order('sort_order');
    if (error) throw fromPostgres(error);
    return ok((data ?? []).map((b) => ({
      id: b.id, slot: b.slot === 'promo' ? 'promo' : 'hero',
      title: b.title, description: b.description,
      ctaLabel: b.cta_label, ctaHref: b.cta_href,
      mediaFileId: b.media_file_id, isVisible: b.is_visible,
      sortOrder: b.sort_order,
    })));
  } catch (err) {
    return actionError(err);
  }
}

export async function saveBanner(input: {
  storeId: string; bannerId?: string | null;
  slot: 'hero' | 'promo';
  mediaFileId?: string | null;
  title?: string; description?: string;
  ctaLabel?: string; ctaHref?: string;
  isVisible?: boolean; sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const supabase = await createClient();
    // ★ `cta_href` يُتحقَّق منه في القاعدة (مسار داخلي أو https فقط)،
    //   فلا يمكن حقن `javascript:` ولو تجاوزت الواجهة.
    const { data, error } = await rpc(supabase, 'save_theme_banner', {
      p_store_id: membership.storeId,
      p_banner_id: input.bannerId ?? null,
      p_slot: input.slot,
      p_media_file_id: input.mediaFileId ?? null,
      p_title: input.title ?? null,
      p_description: input.description ?? null,
      p_cta_label: input.ctaLabel ?? null,
      p_cta_href: input.ctaHref ?? null,
      p_is_visible: input.isVisible ?? null,
      p_sort_order: input.sortOrder ?? null,
    });
    if (error) throw fromPostgres(error);
    await invalidate(membership.storeId);
    return ok({ id: typeof data === 'string' ? data : '' });
  } catch (err) {
    return actionError(err);
  }
}

export async function removeBanner(input: {
  storeId: string; bannerId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'settings:update');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'delete_theme_banner', {
      p_store_id: membership.storeId, p_banner_id: input.bannerId,
    });
    if (error) throw fromPostgres(error);
    await invalidate(membership.storeId);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

// ═══════════════════════ التصنيفات ═══════════════════════

export type CategoryRow = {
  id: string; name: string; slug: string; imageId: string | null;
  imageUrl: string | null; sortOrder: number; isActive: boolean;
  productCount: number;
};

export async function listCategories(storeId: string): Promise<ActionResult<CategoryRow[]>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'products:view');
    const supabase = await createClient();
    const { data, error } = await supabase.from('categories')
      .select('id, name, slug, image_id, sort_order, is_active, media_files(bucket, path), products(count)')
      .eq('store_id', membership.storeId).is('deleted_at', null)
      .order('sort_order');
    if (error) throw fromPostgres(error);

    type Row = {
      id: string; name: string; slug: string; image_id: string | null;
      sort_order: number; is_active: boolean;
      media_files: { bucket: string; path: string } | null;
      products: { count: number }[] | null;
    };
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    return ok(((data ?? []) as unknown as Row[]).map((c) => ({
      id: c.id, name: c.name, slug: c.slug, imageId: c.image_id,
      imageUrl: c.media_files
        ? `${base}/storage/v1/object/public/${c.media_files.bucket}/${c.media_files.path}`
        : null,
      sortOrder: c.sort_order, isActive: c.is_active,
      productCount: c.products?.[0]?.count ?? 0,
    })));
  } catch (err) {
    return actionError(err);
  }
}

export async function saveCategory(input: {
  storeId: string; name: string; categoryId?: string | null;
  imageMediaId?: string | null; clearImage?: boolean;
  sortOrder?: number; isActive?: boolean;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'categories:manage');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'save_category', {
      p_store_id: membership.storeId,
      p_name: input.name,
      p_category_id: input.categoryId ?? null,
      p_image_media_id: input.imageMediaId ?? null,
      p_clear_image: input.clearImage ?? false,
      p_sort_order: input.sortOrder ?? null,
      p_is_active: input.isActive ?? null,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    await invalidate(membership.storeId, ['settings', 'products']);
    return ok({ id: row?.category_id ?? '', slug: row?.slug ?? '' });
  } catch (err) {
    return actionError(err);
  }
}

export async function removeCategory(input: {
  storeId: string; categoryId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'categories:manage');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'delete_category', {
      p_store_id: membership.storeId, p_category_id: input.categoryId,
    });
    if (error) throw fromPostgres(error);
    await invalidate(membership.storeId, ['settings', 'products']);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

// ═══════════════════════ حقول المنتج الرقمي ═══════════════════════

export type DigitalFieldRow = {
  id: string; label: string; hint: string | null;
  sortOrder: number; isActive: boolean;
};

export async function listDigitalFields(input: {
  storeId: string; productId: string;
}): Promise<ActionResult<DigitalFieldRow[]>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'products:view');
    const supabase = await createClient();
    const { data, error } = await supabase.from('product_digital_fields')
      .select('id, label, hint, sort_order, is_active')
      .eq('store_id', membership.storeId).eq('product_id', input.productId)
      .is('deleted_at', null).order('sort_order');
    if (error) throw fromPostgres(error);
    return ok((data ?? []).map((f) => ({
      id: f.id, label: f.label, hint: f.hint,
      sortOrder: f.sort_order, isActive: f.is_active,
    })));
  } catch (err) {
    return actionError(err);
  }
}

export async function saveDigitalField(input: {
  storeId: string; productId: string; label: string;
  fieldId?: string | null; hint?: string; sortOrder?: number; isActive?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'products:update');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'save_digital_field', {
      p_store_id: membership.storeId,
      p_product_id: input.productId,
      p_label: input.label,
      p_field_id: input.fieldId ?? null,
      p_hint: input.hint ?? null,
      p_sort_order: input.sortOrder ?? null,
      p_is_active: input.isActive ?? null,
    });
    if (error) throw fromPostgres(error);
    await invalidate(membership.storeId, ['products']);
    return ok({ id: typeof data === 'string' ? data : '' });
  } catch (err) {
    return actionError(err);
  }
}

export async function removeDigitalField(input: {
  storeId: string; fieldId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'products:update');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'delete_digital_field', {
      p_store_id: membership.storeId, p_field_id: input.fieldId,
    });
    if (error) throw fromPostgres(error);
    await invalidate(membership.storeId, ['products']);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

// ═══════════════════════ تنفيذ الطلب الرقمي ═══════════════════════

/**
 * «تم الشحن» ⇒ مكتمل.
 *
 * ★★ الشرط الحقيقي في القاعدة: `payment_status = 'paid'` وصلاحية
 * `orders:update`. وهذه الطبقة لا تفحص الدفع أصلًا — لو فحصته وحدها
 * لأمكن تجاوزها بنداء REST. الفحص هناك، والرسالة تصل من هناك.
 */
export async function markDigitalShipped(input: {
  storeId: string; orderId: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'orders:update');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'mark_digital_order_shipped', {
      p_order_id: input.orderId,
    });
    if (error) throw fromPostgres(error);
    updateTag(storeTag(membership.storeId, 'orders'));
    return ok({ status: typeof data === 'string' ? data : 'completed' });
  } catch (err) {
    return actionError(err);
  }
}

// ═══════════════════════ مكتبة المنصّة ═══════════════════════

export type LibraryAsset = {
  mediaFileId: string; slug: string; label: string; kind: string;
  url: string;
};

/**
 * أصول المكتبة المتاحة للاختيار.
 *
 * ★ قراءةٌ فقط للتاجر: لا فعل هنا يعدّل أصلًا مشتركًا، والقاعدة تمنع
 * ذلك أصلًا (كتابة `platform_media` لمن يملك `settings:manage` في
 * المنصّة، ودلو `theme-library` بلا سياسة كتابة لأيّ دور عميل).
 */
export async function listLibrary(kind?: 'category' | 'product' | 'banner'):
Promise<ActionResult<LibraryAsset[]>> {
  try {
    const supabase = await createClient();
    let q = supabase.from('platform_media')
      .select('media_file_id, slug, label, kind, media_files(bucket, path)')
      .eq('is_active', true).order('sort_order');
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) throw fromPostgres(error);

    type Row = {
      media_file_id: string; slug: string; label: string; kind: string;
      media_files: { bucket: string; path: string } | null;
    };
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    return ok(((data ?? []) as unknown as Row[])
      .filter((a) => a.media_files != null)
      .map((a) => ({
        mediaFileId: a.media_file_id, slug: a.slug, label: a.label, kind: a.kind,
        url: `${base}/storage/v1/object/public/${a.media_files!.bucket}/${a.media_files!.path}`,
      })));
  } catch (err) {
    return actionError(err);
  }
}
