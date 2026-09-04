import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type WalletOwnerType = Database["public"]["Enums"]["wallet_owner_type"];

export async function getWalletBalance(ownerType: WalletOwnerType, ownerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_ledger")
    .select("amount")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId);
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}

export async function getWalletLedger(ownerType: WalletOwnerType, ownerId: string, limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_ledger")
    .select("id, entry_type, amount, note, created_at")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getActivePayoutMethods() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payout_methods")
    .select("id, name, instructions")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function getMyWithdrawalRequests(ownerType: WalletOwnerType, ownerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("withdrawal_requests")
    .select("id, amount, status, created_at, payout_methods(name)")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
