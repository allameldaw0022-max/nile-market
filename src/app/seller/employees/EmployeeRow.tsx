"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Employee = {
  id: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export function EmployeeRow({ employee }: { employee: Employee }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!confirm(`هل تريد إزالة "${employee.profiles?.full_name ?? "هذا الموظف"}" من المتجر؟`)) return;
    setRemoving(true);
    const supabase = createClient();
    await supabase.from("store_employees").delete().eq("id", employee.id);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-navy">{employee.profiles?.full_name ?? "—"}</p>
        <p className="text-xs text-neutral-400">منذ {new Date(employee.created_at).toLocaleDateString("ar")}</p>
      </div>
      <button
        disabled={removing}
        onClick={remove}
        className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
