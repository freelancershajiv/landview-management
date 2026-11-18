export type WorkScope = { type: "Project" | "Proposal"; code: string };
export function workScope(type: string, value: unknown): WorkScope | null {
  if (type !== "project" && type !== "proposal") return null;
  const raw = String(value ?? "").trim().toUpperCase();
  if (type === "project") {
    const match = raw.match(/^(?:LV[-\s]?)?(\d{1,9})$/);
    return match ? { type: "Project", code: "LV-" + String(Number(match[1])).padStart(3, "0") } : null;
  }
  return /^[A-Z0-9][A-Z0-9_-]{1,119}$/.test(raw) ? { type: "Proposal", code: raw } : null;
}
export function workScopeFromHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return workScope(params.get("scope") || "", params.get("code"));
}
export function workTaskHref(scope: WorkScope, title?: string, description?: string) {
  const params = new URLSearchParams({ tab: "board", scope: scope.type.toLowerCase(), code: scope.code });
  if (title) { params.set("new", "1"); params.set("title", title.slice(0, 240)); }
  if (description) params.set("description", description.slice(0, 4000));
  return "/admin/todo#" + params.toString();
}
export function workRecordHref(scope: WorkScope) {
  return scope.type === "Project" ? "/admin/projects/" + encodeURIComponent(scope.code) + "/lifecycle" : "/admin/proposals/" + encodeURIComponent(scope.code);
}
export function workItemHref(todoCode: string) {
  return "/admin/todo#todo=" + encodeURIComponent(todoCode);
}
export function workScopeQuery(scope: WorkScope) {
  return new URLSearchParams({ mode: "scope", scope: scope.type.toLowerCase(), code: scope.code }).toString();
}
