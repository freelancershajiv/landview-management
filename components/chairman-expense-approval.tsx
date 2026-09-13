"use client";

/**
 * The legacy September 2026 chairman queue used a backend repair routine that
 * recreated historical seed rows whenever EMP-0001 opened the portal.
 *
 * The accounting database has now been rebuilt from the authoritative source
 * workbooks.  Keep this legacy component inert so opening the admin portal can
 * never mutate or re-seed the canonical ledger.
 *
 * A source-safe approval workflow can be added later without any repair/seed
 * side effects.
 */
export default function ChairmanExpenseApproval() {
  return null;
}
