"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus, MailCheck, Store, User } from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { createClient } from "@/lib/supabase/client";
import { describeSignInError, describeSignUpError } from "@/lib/auth/errors";

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginPageClient() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [accountType, setAccountType] = useState<"customer" | "seller">("customer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<"form" | "check-email">("form");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInError) {
        setError(describeSignInError(signInError));
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: accountType },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(describeSignUpError(signUpError));
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setScreen("check-email");
  }

  if (screen === "check-email") {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center bg-white rounded-2xl border border-black/5 p-8">
          <MailCheck className="mx-auto text-primary mb-3" size={40} />
          <h1 className="font-bold text-lg text-navy mb-2">تحقق من بريدك الإلكتروني</h1>
          <p className="text-sm text-neutral-500">
            أرسلنا رابط تأكيد إلى <span className="font-bold">{email}</span>. افتح بريدك
            واضغط الرابط لتفعيل حسابك.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-black/5 p-8">
        <h1 className="font-bold text-xl text-navy mb-1 text-center">
          {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
        </h1>
        <p className="text-xs text-neutral-400 text-center mb-6">سوق النيل</p>

        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setAccountType("customer")}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors ${
                accountType === "customer"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-black/10 text-neutral-500"
              }`}
            >
              <User size={18} /> عميل
            </button>
            <button
              type="button"
              onClick={() => setAccountType("seller")}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors ${
                accountType === "seller"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-black/10 text-neutral-500"
              }`}
            >
              <Store size={18} /> تاجر
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              required
              placeholder="الاسم الكامل"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-primary"
            />
          )}
          <input
            required
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <PasswordInput
            required
            minLength={6}
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 bg-primary text-white text-sm font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {mode === "signin" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {loading ? "..." : mode === "signin" ? "تسجيل الدخول" : "إنشاء الحساب"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="w-full text-center text-xs text-neutral-500 mt-4"
        >
          {mode === "signin" ? (
            <>ليس لديك حساب؟ <span className="text-primary font-bold">أنشئ حسابًا</span></>
          ) : (
            <>لديك حساب بالفعل؟ <span className="text-primary font-bold">سجّل الدخول</span></>
          )}
        </button>

        <Link href="/" className="block text-center text-xs text-neutral-400 mt-2">
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
