import 'server-only';
import { getActor, adminHasLevel, type Actor, type StoreMembership } from '@/lib/auth/actor';
import { STORE_ROLE_PERMISSIONS, type AdminLevel, type AdminSection, type StorePermission } from './permissions';
import { errors } from './errors';

/**
 * ★ الجدار الأول للسلطة. كل Server Action تبدأ بواحدة من هذه الدوال.
 *
 * الجدار الثاني هو RLS في القاعدة، والثالث قيود CHECK والـtriggers.
 * سقوط أي جدار لا يكفي وحده لاختراق النظام.
 */

export async function requireUser() {
  const actor = await getActor();
  if (actor.kind !== 'user') throw errors.unauthenticated();
  if (actor.accountStatus !== 'active')
    throw errors.forbidden('الحساب موقوف أو مغلق');
  return actor;
}

export type StoreContext = {
  actor: Extract<Actor, { kind: 'user' }>;
  membership: StoreMembership;
  storeId: string;
};

/** صلاحية داخل متجر محدد. لا تُمرَّر صلاحية ⇒ العضوية وحدها تكفي. */
export async function requireStoreAccess(
  storeId: string,
  permission?: StorePermission,
): Promise<StoreContext> {
  const actor = await requireUser();
  const membership = actor.stores.find((s) => s.storeId === storeId);

  // عدم العضوية يُعاد كـNOT_FOUND لا FORBIDDEN: لا نؤكد وجود المتجر
  // لمن لا يملكه (منع تعداد الموارد).
  if (!membership) throw errors.notFound();

  if (permission) {
    const allowed =
      membership.role === 'owner' ||
      membership.permissions.has(permission) ||
      STORE_ROLE_PERMISSIONS[membership.role].includes(permission);
    if (!allowed) throw errors.forbidden();
  }

  return { actor, membership, storeId };
}

/** صلاحية على قسم في لوحة المنصة، مع فرض MFA (D28). */
export async function requirePlatformAccess(
  section: AdminSection,
  level: AdminLevel = 'view',
) {
  const actor = await requireUser();
  if (!actor.admin) throw errors.notFound();

  // ★ MFA إلزامي لحسابات Admin ويُفرض على الخادم لا في الواجهة
  if (actor.admin.mfaRequired && actor.aal !== 'aal2') {
    throw errors.forbidden('يلزم إكمال التحقق بخطوتين للوصول إلى لوحة الإدارة');
  }

  if (!adminHasLevel(actor, section, level)) throw errors.notFound();
  return actor;
}

export async function requirePartner() {
  const actor = await requireUser();
  if (!actor.partnerId) throw errors.notFound();
  return { actor, partnerId: actor.partnerId };
}

/** فحص صامت للواجهة — لا يرمي، ويُستخدم لإخفاء عناصر فقط. */
export function can(
  membership: StoreMembership | undefined,
  permission: StorePermission,
): boolean {
  if (!membership) return false;
  return (
    membership.role === 'owner' ||
    membership.permissions.has(permission) ||
    STORE_ROLE_PERMISSIONS[membership.role].includes(permission)
  );
}
