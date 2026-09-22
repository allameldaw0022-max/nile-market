/**
 * كوكي الإحالة.
 *
 * ★ HttpOnly وSameSite=Lax ويُكتب **خادميًا** فقط — لا localStorage.
 * السبب: قيمة الكوكي تحدّد من يقبض 50% من اشتراكات هذا التاجر مدى
 * الحياة (D19)، فلا يجوز أن تكون قابلة للتعديل من المتصفح.
 */
export const REFERRAL_COOKIE = 'nm_ref';
export const REFERRAL_MAX_AGE = 30 * 24 * 60 * 60; // 30 يومًا (D19)
export const VISITOR_COOKIE = 'nm_visitor';
export const CART_COOKIE = 'nm_cart';
