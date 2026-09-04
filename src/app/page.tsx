import { SITE_NAME, SITE_NAME_EN } from "@/lib/site";

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold text-primary">{SITE_NAME}</h1>
      <p className="text-neutral-500">{SITE_NAME_EN} — قيد الإنشاء</p>
    </main>
  );
}
