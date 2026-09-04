"use client";

const STORAGE_KEY = "nm_ref";

// Captured once when a visitor lands on a product page via ?ref=CODE, then
// read back later at add-to-cart time -- survives a login/signup redirect
// since it's not tied to the URL. The code itself is meaningless without
// resolve_marketer_code() validating it server-side, so nothing here needs
// to be trusted.
export function captureReferralCode(code: string | null) {
  if (!code) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // localStorage unavailable (private mode, etc.) -- link tracking is a
    // nice-to-have, never block the page over it.
  }
}

export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem("nm_visitor");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("nm_visitor", id);
    }
    return id;
  } catch {
    return "unknown";
  }
}
