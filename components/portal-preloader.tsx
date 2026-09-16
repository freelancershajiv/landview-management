"use client";

type PortalType = "admin" | "employee" | "client";

export default function PortalPreloader({ portal }: { portal: PortalType }) {
  // Broad data warming used to fire many speculative API requests after each
  // portal load. That overloaded the Supabase-backed runtime and competed with
  // the page the user was actually opening. Keep the component contract so the
  // layouts stay stable, but let each page fetch only the data it needs.
  void portal;
  return null;
}
