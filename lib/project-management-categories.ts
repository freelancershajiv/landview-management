const categoryAliases = new Map<string, string>();
for (const [preferred, older] of [
  ["Electrical Materials", "Electrical Material"],
  ["Plumbing Materials", "Plumbing Material"],
  ["Grill", "Grills"],
  ["LAND VIEW", "Land View"],
  ["Others", "Other Expenses"],
  ["Scrap Selling", "Scrap"],
]) {
  categoryAliases.set(preferred.toLowerCase(), preferred);
  categoryAliases.set(older.toLowerCase(), preferred);
}

export function pmCategoryName(value: unknown): string {
  const label = String(value ?? "").trim();
  return categoryAliases.get(label.toLowerCase()) ?? label;
}

export const PM_INCOME_CATEGORIES = [
  "Cash", "Cheque", "Bank Transfer", "Scrap Selling",
] as const;

export const PM_EXPENSE_CATEGORIES = [
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
  "Electrical Materials",
  "Electricity Bill",
  "Filling Sand",
  "Filling Soil",
  "Filling Soil Labour",
  "Finishing Masonry",
  "Gift",
  "Grill",
  "LAND VIEW",
  "Launch",
  "Masonry",
  "Medical/Medicine",
  "Mr. Mahi Bhai",
  "Nasta",
  "Normal Sand",
  "Others",
  "Plastic/Chot",
  "Plumbing Contractor",
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


// "Scrap" is an income-only historical label in the live ledger.
const incomeNames = new Set([...PM_INCOME_CATEGORIES, "Scrap"].map(x => x.toLowerCase()));

function categoryOf(row: unknown): string {
  if (typeof row === "string") return pmCategoryName(row);
  if (row && typeof row === "object" && "category" in row)
    return pmCategoryName((row as { category?: unknown }).category);
  return "";
}

/**
 * A complete set of expense categories for entry and party setup:
 * 1. seeded production/history options (even for brand-new projects)
 * 2. the selected project's existing category totals
 * 3. categories on any of its ledger entries and saved supplier contracts
 * 4. the value being edited, even if it is from an older spelling
 *
 * Collapse the six approved aliases while preserving unrelated categories.
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
    const label = pmCategoryName(value);
    if (label) options.add(label); // Preserve even an unusual existing edit value.
  }

  const other = Array.from(options).filter(x => x !== "Others");
  other.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "variant" }));
  return ["Others", ...other];
}
