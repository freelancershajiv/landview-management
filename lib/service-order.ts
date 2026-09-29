export const STANDARD_SERVICE_ORDER = [
  "Architectural Design",
  "Structural Design",
  "3D Design - Exterior",
  "3D Design - Interior",
  "Electrical Design",
  "Fire Safety Design",
  "Plumbing Design",
  "Plan Approval Design",
  "Estimate & Costing",
  "Design Books",
] as const;

type ServiceLike = { Service?: unknown; service?: unknown };

function normalizeService(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[–—_-]+/g, " ").replace(/\s+/g, " ");
}

export function standardServiceLabel(value: unknown) {
  const normalized = normalizeService(value);
  if (!normalized) return "";
  const match = STANDARD_SERVICE_ORDER.find((name) => normalizeService(name) === normalized);
  if (match) return match;
  if (normalized === "3d design exterior" || normalized === "3d exterior" || normalized === "exterior 3d" || normalized === "3d design") {
    return "3D Design - Exterior";
  }
  if (normalized === "3d design interior" || normalized === "3d interior" || normalized === "interior 3d") {
    return "3D Design - Interior";
  }
  if (normalized === "redesign fees" || normalized === "re design fees") return "Re-Design Fees";
  if (normalized === "fire safetry design" || normalized === "fire safety design") return "Fire Safety Design";
  return String(value ?? "").trim();
}

export function serviceSortRank(value: unknown) {
  const normalized = normalizeService(standardServiceLabel(value));
  const index = STANDARD_SERVICE_ORDER.findIndex((name) => normalizeService(name) === normalized);
  return index >= 0 ? index : STANDARD_SERVICE_ORDER.length;
}

export function sortServicesByStandardOrder<T extends ServiceLike>(items: T[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => serviceSortRank(a.item.Service ?? a.item.service) - serviceSortRank(b.item.Service ?? b.item.service) || a.index - b.index)
    .map(({ item }) => item);
}
