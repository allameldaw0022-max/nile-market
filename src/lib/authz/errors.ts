/** أخطاء التطبيق الموحّدة — رسائلها عربية وتُعرض للمستخدم مباشرة. */
export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR'
  | 'LIMIT_EXCEEDED' | 'SUBSCRIPTION_INACTIVE' | 'FEATURE_DISABLED'
  | 'ILLEGAL_TRANSITION' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly action?: { label: string; href: string },
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  unauthenticated: () =>
    new AppError('UNAUTHENTICATED', 'يجب تسجيل الدخول للمتابعة'),
  /** يُرجَع NOT_FOUND بدل FORBIDDEN على مورد قد لا يملكه المستخدم،
   *  حتى لا يكشف الخطأ وجود المورد (منع تعداد الموارد). */
  forbidden: (msg = 'ليس لديك صلاحية لهذا الإجراء') =>
    new AppError('FORBIDDEN', msg),
  notFound: (msg = 'العنصر غير موجود') => new AppError('NOT_FOUND', msg),
  validation: (msg: string, field?: string) =>
    new AppError('VALIDATION_ERROR', msg, { field }),
  limitExceeded: (feature: string, used: number, limit: number) =>
    new AppError(
      'LIMIT_EXCEEDED',
      `وصلت إلى الحد الأقصى في باقتك الحالية (${limit}).`,
      { feature, used, limit },
      { label: 'ترقية الباقة', href: '/dashboard/subscription' },
    ),
  subscriptionInactive: () =>
    new AppError(
      'SUBSCRIPTION_INACTIVE',
      'اشتراك المتجر غير نشط حاليًا',
      undefined,
      { label: 'تجديد الاشتراك', href: '/dashboard/subscription' },
    ),
  rateLimited: () =>
    new AppError('RATE_LIMITED', 'محاولات كثيرة — حاول بعد قليل'),
  internal: (correlationId?: string) =>
    new AppError('INTERNAL', 'حدث خطأ غير متوقع، تم إبلاغ الفريق', { correlationId }),
};

/** يترجم أخطاء Postgres إلى أخطاء تطبيق دون تسريب تفاصيل القاعدة. */
export function fromPostgres(err: { code?: string; message?: string }): AppError {
  const msg = err.message ?? '';
  const named = (prefix: string) => msg.startsWith(prefix);

  if (named('LIMIT_EXCEEDED')) {
    const [, feature, used, limit] = msg.split(':');
    return errors.limitExceeded(feature, Number(used), Number(limit));
  }
  if (named('SUBSCRIPTION_INACTIVE') || named('SUBSCRIPTION_MISSING'))
    return errors.subscriptionInactive();
  if (named('CHECKOUT_DISABLED'))
    return new AppError('FEATURE_DISABLED', 'هذا المتجر غير متاح للشراء حاليًا');
  if (named('FEATURE_DISABLED'))
    return new AppError('FEATURE_DISABLED', msg.split(':').slice(1).join(':').trim());
  if (named('ILLEGAL_TRANSITION') || named('ILLEGAL_TICKET_TRANSITION'))
    return new AppError('ILLEGAL_TRANSITION', 'لا يمكن الانتقال إلى هذه الحالة');
  if (named('FEATURE_UNAVAILABLE'))
    return new AppError('FEATURE_DISABLED', msg.split(':').slice(1).join(':').trim(),
      undefined, { label: 'ترقية الباقة', href: '/dashboard/subscription' });
  // رسائل تحقق تُكتب في القاعدة بالعربية وتُعرض للمستخدم كما هي.
  // القاعدة هي المصدر الوحيد للتحقق ⇒ رسالتها هي رسالة الواجهة.
  if (named('OUT_OF_STOCK') || named('INVALID_ZONE') || named('EMPTY_CART') ||
      named('CONTACT_REQUIRED') || named('REASON_REQUIRED') ||
      named('PAYMENT_METHOD_DISABLED') || named('INVALID_QUANTITY') ||
      named('VALIDATION') || named('SLUG_TAKEN') || named('STORE_EXISTS') ||
      named('INVALID_MEDIA') || named('INVALID_MIME') || named('FILE_TOO_LARGE') ||
      named('INVALID_SIZE') || named('INVALID_PURPOSE'))
    return new AppError('VALIDATION_ERROR', msg.split(':').slice(1).join(':').trim() || msg);
  if (err.code === '42501' || named('FORBIDDEN'))
    return errors.forbidden();
  if (err.code === '23505') return new AppError('CONFLICT', 'هذا العنصر موجود مسبقًا');
  if (err.code === 'P0002' || named('NOT_FOUND')) return errors.notFound();

  // لا يُسرَّب نص خطأ القاعدة إلى المستخدم إطلاقًا
  return errors.internal();
}
