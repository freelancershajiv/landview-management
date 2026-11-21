/** Site visits and construction-supervision startup belong to Site Visits, never the To Do work queue. */
export type WorkArea = "projects" | "site_visits";
export type WorkAreaRow = {work_area?:unknown; title?:unknown; automation_source?:unknown};
const SITE_VISIT_TITLE = /\bsite\s+visits?\b|\bsite\s+inspections?\b|^\s*start\s+site\s+supervision\b|^\s*resolve\s+site\s+issue\b/i;
export function isSiteVisitWork(row: WorkAreaRow): boolean {
  return String(row.work_area||"").trim().toLowerCase()==="site_visits" ||
    SITE_VISIT_TITLE.test(String(row.title||""));
}
export function isProjectWorkTodo<T extends WorkAreaRow>(row:T): boolean {
  return !isSiteVisitWork(row);
}
export function assertProjectWorkTitle(title:unknown):void {
  if(isSiteVisitWork({title})) {
    throw new Error("Site visits and site supervision startup are managed in Site Visits, not To Do.");
  }
}
