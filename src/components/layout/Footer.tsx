import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-navy text-white/70">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-start">
        <p className="text-xs">
          © {year} <span className="font-bold text-white">{SITE_NAME}</span> — جميع
          الحقوق محفوظة.
        </p>

        <nav
          aria-label="روابط قانونية"
          className="flex items-center justify-center gap-4 text-xs"
        >
          <Link href="/privacy" className="hover:text-white transition-colors">
            سياسة الخصوصية
          </Link>
          <span aria-hidden className="text-white/25">
            ·
          </span>
          <Link href="/terms" className="hover:text-white transition-colors">
            شروط الخدمة
          </Link>
        </nav>
      </div>
    </footer>
  );
}
