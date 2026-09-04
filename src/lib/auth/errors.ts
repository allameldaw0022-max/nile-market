import type { AuthError } from "@supabase/supabase-js";

// Supabase's error messages are English and sometimes overly specific
// (leaking whether an email exists). Map to safe, Arabic, user-facing text.
export function describeSignInError(error: AuthError): string {
  if (error.message.includes("Invalid login credentials")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  }
  if (error.message.includes("Email not confirmed")) {
    return "يجب تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد.";
  }
  return "تعذّر تسجيل الدخول. حاول مرة أخرى.";
}

export function describeSignUpError(error: AuthError): string {
  if (error.message.includes("Password should be at least")) {
    return "كلمة المرور قصيرة جدًا (6 أحرف على الأقل).";
  }
  if (error.message.includes("Unable to validate email")) {
    return "صيغة البريد الإلكتروني غير صحيحة.";
  }
  return "تعذّر إنشاء الحساب. حاول مرة أخرى.";
}
