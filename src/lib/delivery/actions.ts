'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';

/**
 * مناطق التوصيل وأجورها.
 *
 * الأجرة تُقرأ من هذا الجدول وقت إنشاء الطلب في `create_order` ولا
 * تُرسل من المتصفح إطلاقًا، فهذه الشاشة هي المصدر الوحيد لسعر التوصيل.
 */

export type DeliveryZone = {
  id: string; name: string; fee: number;
  minOrderFree: number | null;
  estDaysMin: number | null; estDaysMax: number | null;
  isActive: boolean; sortOrder: number;
};

type ZoneRow = {
  id: string; name: string; fee: number; min_order_free: number | null;
  est_days_min: number | null; est_days_max: number | null;
  is_active: boolean; sort_order: number;
};

const toZone = (r: ZoneRow): DeliveryZone => ({
  id: r.id, name: r.name, fee: Number(r.fee),
  minOrderFree: r.min_order_free === null ? null : Number(r.min_order_free),
  estDaysMin: r.est_days_min, estDaysMax: r.est_days_max,
  isActive: r.is_active, sortOrder: r.sort_order,
});

const SELECT =
  'id, name, fee, min_order_free, est_days_min, est_days_max, is_active, sort_order';

export async function listDeliveryZones(
  storeId: string,
): Promise<ActionResult<DeliveryZone[]>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'settings:view');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('delivery_zones').select(SELECT)
      .eq('store_id', membership.storeId).is('deleted_at', null)
      .order('sort_order').order('created_at');
    if (error) throw fromPostgres(error);
    return ok((data ?? []).map((r) => toZone(r as ZoneRow)));
  } catch (err) {
    return actionError(err);
  }
}

function validate(input: { name: string; fee: number; minOrderFree?: number | null;
                           estDaysMin?: number | null; estDaysMax?: number | null }) {
  const name = input.name.trim();
  if (name.length < 2) throw errors.validation('اسم المنطقة مطلوب', 'name');
  if (name.length > 80) throw errors.validation('اسم المنطقة طويل جدًا', 'name');
  if (!Number.isFinite(input.fee) || input.fee < 0)
    throw errors.validation('أجرة التوصيل لا تكون سالبة', 'fee');
  if (input.minOrderFree != null && input.minOrderFree < 0)
    throw errors.validation('حد التوصيل المجاني لا يكون سالبًا', 'min_order_free');
  const min = input.estDaysMin, max = input.estDaysMax;
  if (min != null && min < 0) throw errors.validation('عدد الأيام لا يكون سالبًا');
  if (max != null && max < 0) throw errors.validation('عدد الأيام لا يكون سالبًا');
  if (min != null && max != null && max < min)
    throw errors.validation('أقصى مدة توصيل يجب ألا تقل عن أدناها');
  return name;
}

export async function saveDeliveryZone(input: {
  storeId: string; zoneId?: string | null;
  name: string; fee: number;
  minOrderFree?: number | null;
  estDaysMin?: number | null; estDaysMax?: number | null;
  isActive?: boolean;
}): Promise<ActionResult<DeliveryZone>> {
  try {
    const name = validate(input);
    const { membership } = await requireStoreAccess(input.storeId, 'delivery:manage');
    const supabase = await createClient();

    const patch = {
      name,
      fee: input.fee,
      min_order_free: input.minOrderFree ?? null,
      est_days_min: input.estDaysMin ?? null,
      est_days_max: input.estDaysMax ?? null,
      is_active: input.isActive ?? true,
    };

    const query = input.zoneId
      ? supabase.from('delivery_zones').update(patch)
          .eq('id', input.zoneId).eq('store_id', membership.storeId)
          .select(SELECT).single()
      : supabase.from('delivery_zones')
          .insert({ ...patch, store_id: membership.storeId })
          .select(SELECT).single();

    const { data, error } = await query;
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'settings'));
    return ok(toZone(data as ZoneRow));
  } catch (err) {
    return actionError(err);
  }
}

/**
 * حذف ناعم: الطلبات القائمة تشير إلى المنطقة، وحذفها فعليًا يقطع
 * تاريخ الطلب.
 */
export async function deleteDeliveryZone(
  storeId: string, zoneId: string,
): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'delivery:manage');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('delivery_zones')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', zoneId).eq('store_id', membership.storeId)
      .is('deleted_at', null)
      .select('id');
    if (error) throw fromPostgres(error);
    if (!data || data.length === 0) throw errors.notFound();

    updateTag(storeTag(membership.storeId, 'settings'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
