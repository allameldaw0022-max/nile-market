import { Layers } from "lucide-react";
import { getAllPlans } from "@/lib/queries/admin";
import { PlanForm } from "./PlanForm";
import { PlanRow } from "./PlanRow";

export default async function AdminPlansPage() {
  const plans = await getAllPlans();

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">باقات الاشتراك</h1>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-4">
        <p className="text-sm font-bold text-navy mb-3">إضافة باقة جديدة</p>
        <PlanForm />
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Layers className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد باقات بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </main>
  );
}
