import { Star } from "lucide-react";
import { getPlatformMarketers, getEligibleMarketerProfiles } from "@/lib/queries/admin";
import { AddPlatformMarketerForm } from "./AddPlatformMarketerForm";
import { PlatformMarketerRow } from "./PlatformMarketerRow";

export default async function AdminPlatformMarketersPage() {
  const [marketers, eligibleProfiles] = await Promise.all([getPlatformMarketers(), getEligibleMarketerProfiles()]);

  const usedProfileIds = new Set(marketers.map((m) => m.profile_id));
  const availableProfiles = eligibleProfiles.filter((p) => !usedProfileIds.has(p.id));
  const activeCount = marketers.filter((m) => m.is_active).length;

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-xl text-navy">مسوّقو الـ50 (البرنامج الترويجي)</h1>
        <span className="text-xs font-bold bg-gold/20 text-gold-dark px-3 py-1.5 rounded-full">
          {activeCount} / 50
        </span>
      </div>

      {activeCount < 50 && (
        <div className="bg-white rounded-2xl border border-black/5 p-4 mb-4">
          <p className="text-sm font-bold text-navy mb-3">إضافة مسوّق جديد للبرنامج</p>
          <AddPlatformMarketerForm profiles={availableProfiles} />
        </div>
      )}

      {marketers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Star className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا يوجد مسوّقون في البرنامج بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {marketers.map((m) => (
            <PlatformMarketerRow key={m.id} marketer={m} />
          ))}
        </div>
      )}
    </main>
  );
}
