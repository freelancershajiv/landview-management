export type BillCategory = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";
export type BillEntryMode = "quantity_rate" | "flat_amount";

export type BillServiceDefinition = {
  category: BillCategory;
  service: string;
  defaultMode: BillEntryMode;
};

export const BILL_CATEGORIES: BillCategory[] = [
  "Engineering Bill",
  "Supervision Bill",
  "Other Services Bill",
];

export const BILL_SERVICE_CATALOG: BillServiceDefinition[] = [
  { category: "Engineering Bill", service: "Architectural Design", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Structural Design", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "3D Design – Exterior", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "3D Design – Interior", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Electrical Design", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Fire Safety Design", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Plumbing Design", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Plan Approval Design", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Estimate & Costing", defaultMode: "flat_amount" },
  { category: "Engineering Bill", service: "Design Books", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Municipality Land NOC", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Fire Service Approval", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Municipality Approval", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "District Vetting Committee Approval", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Consultancy Fees", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Submission Fees", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Soil Test", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Digital Survey", defaultMode: "quantity_rate" },
  { category: "Other Services Bill", service: "Municipality File Pass", defaultMode: "quantity_rate" },
  { category: "Supervision Bill", service: "Site Supervision", defaultMode: "quantity_rate" },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function key(value: unknown) {
  return clean(value).toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}

export function numberValue(value: unknown) {
  const parsed = Number(clean(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeBillCategory(value: unknown): BillCategory {
  const raw = clean(value).toLowerCase();
  if (raw === "supervision" || raw === "supervision bill") return "Supervision Bill";
  if (["other", "others", "other services", "other services bill", "others bill"].includes(raw)) return "Other Services Bill";
  // Design Books was historically used as a category. It is an Engineering service.
  return "Engineering Bill";
}

export function serviceDefinition(value: unknown) {
  const wanted = key(value);
  return BILL_SERVICE_CATALOG.find((item) => key(item.service) === wanted) || null;
}

export function categoryForService(value: unknown, fallback: BillCategory = "Engineering Bill") {
  return serviceDefinition(value)?.category || fallback;
}

export function defaultEntryModeForService(value: unknown, fallbackCategory: BillCategory = "Engineering Bill"): BillEntryMode {
  const definition = serviceDefinition(value);
  if (definition) return definition.defaultMode;
  return fallbackCategory === "Other Services Bill" ? "quantity_rate" : "flat_amount";
}

export function lineGross(input: {
  mode: BillEntryMode;
  quantity?: unknown;
  unitPrice?: unknown;
  amount?: unknown;
}) {
  if (input.mode === "quantity_rate") {
    return Math.max(0, numberValue(input.quantity)) * Math.max(0, numberValue(input.unitPrice));
  }
  return Math.max(0, numberValue(input.amount));
}

export function normalizedBillPricing(input: {
  mode: BillEntryMode;
  quantity?: unknown;
  unitPrice?: unknown;
  amount?: unknown;
}) {
  const gross = lineGross(input);
  if (input.mode === "quantity_rate") {
    return {
      gross,
      quantity: Math.max(0, numberValue(input.quantity)),
      unitPrice: Math.max(0, numberValue(input.unitPrice)),
    };
  }
  return { gross, quantity: 1, unitPrice: gross };
}

export function entryModeFromStored(quantity: unknown, unitPrice: unknown): BillEntryMode {
  return numberValue(quantity) > 0 && numberValue(unitPrice) > 0 ? "quantity_rate" : "flat_amount";
}
