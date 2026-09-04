import type { Database } from "@/lib/supabase/database.types";

type LedgerEntryType = Database["public"]["Enums"]["ledger_entry_type"];

const ENTRY_LABELS: Record<LedgerEntryType, string> = {
  seller_earning: "أرباح طلب",
  marketer_commission: "عمولة تسويق",
  platform_revenue: "عمولة المنصة",
  withdrawal_paid: "تنفيذ سحب",
};

export type LedgerRow = {
  id: string;
  entry_type: LedgerEntryType;
  amount: number;
  note: string | null;
  created_at: string;
};

export function WalletLedgerList({ rows }: { rows: LedgerRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400 text-center py-8">لا توجد حركات مالية بعد.</p>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="bg-white rounded-xl border border-black/5 p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-navy">{ENTRY_LABELS[row.entry_type]}</p>
            <p className="text-[10px] text-neutral-400">{new Date(row.created_at).toLocaleString("ar")}</p>
          </div>
          <span className={`text-sm font-extrabold ${row.amount >= 0 ? "text-primary" : "text-red-500"}`}>
            {row.amount >= 0 ? "+" : ""}
            {row.amount.toLocaleString("ar")} SDG
          </span>
        </div>
      ))}
    </div>
  );
}
