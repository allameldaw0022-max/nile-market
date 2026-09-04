import { cache } from "react";
import { createClient } from "./server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "customer" | "seller" | "marketer" | "admin";
};

// cache() so however many server components ask "who's signed in?" during
// one request, only a single auth round-trip actually happens.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // The profiles row is created atomically at signup (handle_new_user
    // trigger), so an authenticated user with no row here is always a
    // sign of a bug, not a legitimate state -- log it instead of quietly
    // rendering that user as an anonymous customer.
    console.error("getCurrentUser: no profile row for authenticated user", user.id, error);
  }

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? "customer",
  };
});
