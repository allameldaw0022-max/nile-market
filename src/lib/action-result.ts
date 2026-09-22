import { AppError, errors } from '@/lib/authz/errors';

/** الشكل الموحّد لنتيجة كل Server Action (API.md §12.4). */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false; code: string; message: string;
      field?: string;
      action?: { label: string; href: string };
    };

export function actionError(err: unknown): ActionResult<never> {
  const e = err instanceof AppError ? err : errors.internal();
  if (!(err instanceof AppError)) {
    // يُسجَّل خادميًا ولا يُسرَّب تفصيله للمستخدم
    console.error('[action] خطأ غير متوقع', err);
  }
  return {
    ok: false, code: e.code, message: e.message,
    field: e.details?.field as string | undefined,
    action: e.action,
  };
}

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
