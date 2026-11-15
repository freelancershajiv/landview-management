/**
 * LAND VIEW Project Management category catalog.
 *
 * The seed combines the established UI categories with expense categories
 * actually recorded in the production project ledger (Nov 2026). Keep the
 * historic spellings unchanged: expense, supplier and contract matching can
 * depend on exact category text.
 *
 * Never use a project's non-empty ledger-category list AS the entire set of
 * categories offered for new expenses. Historical rows and contract categories
 * are added on top of this independent catalog, not used to replace it.
 */

export const PM_INCOME_CATEGORIES = [
  "Cash", "Cheque", "Bank Transfer", "Scrap Selling",
] as const;

/* Historical display names deliberately remain distinct, including
   LAND VIEW / Land View, Grill / Grills and Other Expenses / Others. */
export const PM_EXPENSE_CATEGORIES = [
  "Other Expenses",
  "3 Decimal",
  "Admixture",
  "Animal Breakfast",
  "Binding Cable",
  "Blocks",
  "Bonus",
  "Brick Chips",
  "Brick Strike",
  "Bricks",
  "CCTV",
  "Cement",
  "Cement & Steel",
  "Cleaning",
  "Communication",
  "Deep Contractor",
  "Deep Materials",
  "Donation",
  "Door",
  "Doors & Wood",
  "Electric Contractor",
  "Electric Line Extension",
  "Electrical Material",
  "Electrical Materials",
  "Electricity Bill",
  "Filling Sand",
  "Filling Soil",
  "Filling Soil Labour",
  "Finishing Masonry",
  "Gift",
  "Grill",
  "Grills",
  "LAND VIEW",
  "Land View",
  "Launch",
  "Masonry",
  "Medical/Medicine",
  "Mr. Mahi Bhai",
  "Nasta",
  "Normal Sand",
  "Others",
  "Plastic/Chot",
  "Plumbing Contractor",
  "Plumbing Material",
  "Plumbing Materials",
  "R.C.C Masonry",
  "Rent",
  "Sand Fill Labour",
  "Security",
  "Security Salary",
  "SS Grills & Works",
  "Steel",
  "Stone",
  "Stone & Sand",
  "Syleth Sand",
  "Tiles",
  "Tin Shed",
  "Tubewell",
] as const;

type CategoryRow = { category?: unknown; credit?: unknown; debit?: unknown };
type ContractRow = { category?: unknown };

export type PMCategorySource = {
  categories?: Array<{ category?: unknown } | string> | null;
  entries?: CategoryRow[] | null;
  contractorBills?: { contracts?: ContractRow[] | null } | null;
} | null | undefined;

const clean = (v: unknown) => String(v ?? "").trim();
// "Scrap" is an income-only historical label in the live ledger.
const incomeNames = new Set([...PM_INCOME_CATEGORIES, "Scrap"].map(x => x.toLowerCase()));

function categoryOf(row: unknown): string {
  if (typeof row === "string") return clean(row);
  if (row && typeof row === "object" && "category" in row)
    return clean((row as { category?: unknown }).category);
  return "";
}

/**
 * A complete set of expense categories for entry and party setup:
 * 1. seeded production/history options (even for brand-new projects)
 * 2. the selected project's existing category totals
 * 3. categories on any of its ledger entries and saved supplier contracts
 * 4. the value being edited, even if it is from an older spelling
 *
 * Keep exact strings; never rewrite transactions or combine historical labels.
 */
export function pmExpenseCategoryOptions(
  source: PMCategorySource,
  ...selected: unknown[]
): string[] {
  const options = new Set<string>(PM_EXPENSE_CATEGORIES);
  const add = (candidate: unknown) => {
    const label = categoryOf(candidate);
    if (!label || incomeNames.has(label.toLowerCase())) return;
    options.add(label);
  };

  for (const category of source?.categories ?? []) add(category);
  for (const row of source?.entries ?? []) {
    // Expense rows plus any historical nonstandard category: the default
    // source.categories field includes labels that still need to be selectable.
    if (Number(row.credit || 0) > 0) add(row);
  }
  for (const row of source?.contractorBills?.contracts ?? []) add(row);
  for (const value of selected) {
    const label = clean(value);
    if (label) options.add(label); // Preserve even an unusual existing edit value.
  }

  const other = Array.from(options).filter(x => x !== "Other Expenses");
  other.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "variant" }));
  return ["Other Expenses", ...other];
}
