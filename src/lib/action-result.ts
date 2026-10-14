// ★ نسبيٌّ بامتداد صريح: طبقة الأخطاء تُشغَّل في اختبارات الوحدة
//   بـnode مباشرة بلا مُحلِّل مسارات Next (انظر `authz/errors.ts`).
import { AppError, errors } from './authz/errors.ts';

/** الشكل الموحّد لنتيجة كل Server Action (API.md §12.4). */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false; code: string; message: string;
      field?: string;
      action?: { label: string; href: string };
    };

export function actionError(err: unknown): ActionResult<never> {
  // ★ خطأٌ ليس من أخطائنا (TypeError · فشل شبكة · استثناء غير متوقّع):
  //   `errors.internal` تسجّله برمزٍ يراه المستخدم. ولا يُسرَّب نصّه:
  //   قد يحمل مسارات أو قيمًا من الطلب.
  const e = err instanceof AppError ? err : errors.internal({
    reason: err instanceof Error ? err.name : typeof err,
    at: err instanceof Error
      ? (err.stack ?? '').split('\n')[1]?.trim().slice(0, 200)
      : undefined,
  });
  return {
    ok: false, code: e.code, message: e.message,
    field: e.details?.field as string | undefined,
    action: e.action,
  };
}

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
