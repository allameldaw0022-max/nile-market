import 'server-only';
// ★ نسبيٌّ لا `@/`: اختبارات الوحدة تشغّل هذا الملف بـnode مباشرة بلا
//   مُحلِّل مسارات Next، فاسمٌ مستعار هنا يجعل طبقة الأخطاء كلّها غير
//   قابلة للاختبار — وهي آخر ما نقبل بقاءه بلا حارس.
import { log } from '../observability/logger.ts';

/** أخطاء التطبيق الموحّدة — رسائلها عربية وتُعرض للمستخدم مباشرة. */
export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR'
  | 'LIMIT_EXCEEDED' | 'SUBSCRIPTION_INACTIVE' | 'FEATURE_DISABLED'
  | 'ILLEGAL_TRANSITION' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL';

export class AppError extends Error {
  // ★ إسنادٌ صريح لا «خاصّيات معاملات» (`readonly code: ErrorCode` في
  //   التوقيع): تلك صيغةٌ لا يفهمها مجرّد نزع الأنواع، فيسقط استيراد
  //   هذا الملف في اختبارات الوحدة (`--experimental-strip-types`) —
  //   أي أن أخطاءنا تصير غير قابلة للاختبار أصلًا.
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly action?: { label: string; href: string };

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    action?: { label: string; href: string },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.action = action;
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
  /**
   * ★★★ خطأ غير متوقع: يُسجَّل **هنا** ويحمل رمزًا يراه المستخدم.
   *
   * كانت هذه الدالّة تُنتج `AppError`، و`actionError` تسجّل ما **ليس**
   * `AppError` وحده ⇒ كل خطأ قاعدة غير معروف يختفي بلا سطرٍ واحد في
   * أي سجلّ، والمستخدم يُطمأن بـ«تم إبلاغ الفريق» ولم يُبلَّغ أحد.
   * هكذا بقي عطل أكواد الخصم شهرًا بلا أن يعرف به أحد، ولم يُشخَّص
   * إلا من شكوى تاجر.
   *
   * الرمز هو الوصلة: التاجر يقوله للدعم، والدعم يجده في السجلّ.
   */
  internal: (fields: Record<string, string | number | null | undefined> = {}) => {
    const id = correlationId();
    log.error('internal_error', { correlation_id: id, ...fields });
    return new AppError(
      'INTERNAL',
      `حدث خطأ غير متوقع. إن تكرّر فأرسل هذا الرمز للدعم: ${id}`,
      { correlationId: id },
    );
  },
};

/** ثماني خانات: قصيرٌ يُملى هاتفيًّا، وواسعٌ بما يكفي للبحث في السجلّ. */
function correlationId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * أوّل إطار في المكدّس خارج هذا الملف — يقول «من أين جاء الخطأ».
 * بلا نصّ المستخدم ولا وسائطه: اسم الدالّة والملف فقط.
 */
function originFrame(): string | undefined {
  const frames = (new Error().stack ?? '').split('\n').slice(1);
  const frame = frames.find((f) => !f.includes('authz/errors'));
  return frame?.trim().slice(0, 200);
}

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
  // ★★★ أخطاء إدخالٍ تبدو أخطاءَ نظام إن لم تُترجَم:
  //   22003 رقمٌ أكبر من سعة عموده · 22P02 نصٌّ في موضع رقم ·
  //   23514 قيمةٌ تخالف قيد الجدول · 22001 نصٌّ أطول من عموده.
  //   كانت تسقط إلى «حدث خطأ غير متوقع، تم إبلاغ الفريق» — فيعيد
  //   التاجر المحاولة بالقيمة نفسها لأنه لا يعرف أنّها هي الخطأ.
  //   (مُثبَت من لقطة شاشة تاجر: أربع محاولات في خمس ساعات.)
  if (err.code === '22003')
    return new AppError('VALIDATION_ERROR', 'رقمٌ من الأرقام كبير جدًا — راجع الأرقام المُدخَلة');
  if (err.code === '22P02')
    return new AppError('VALIDATION_ERROR', 'قيمة غير صالحة في أحد الحقول — راجع ما أدخلته');
  if (err.code === '22001')
    return new AppError('VALIDATION_ERROR', 'نصٌّ من النصوص طويل جدًا — اختصره');
  if (err.code === '23514')
    return new AppError('VALIDATION_ERROR', 'قيمة غير مقبولة في أحد الحقول — راجع ما أدخلته');
  if (err.code === 'P0002' || named('NOT_FOUND')) return errors.notFound();

  // لا يُسرَّب نص خطأ القاعدة إلى المستخدم إطلاقًا — لكنه **يُسجَّل**
  // خادميًّا مربوطًا برمز يراه المستخدم، وإلا فالعطل بلا أثر.
  //
  // ★ `details` و`hint` من Postgres **لا تُسجَّل**: فيهما قيمُ الصفّ
  //   نفسها («Key (phone)=(09…) already exists») وهي بيانات شخصية.
  //   و`message` في هذا المستودع نصٌّ ثابت نكتبه نحن أو وصفُ قيدٍ.
  return errors.internal({
    pg_code: err.code ?? null,
    pg_message: msg.slice(0, 300),
    at: originFrame(),
  });
}
