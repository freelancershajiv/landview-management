export function dhakaDay(now = Date.now()) {
  return new Date(now + 21600000).toISOString().slice(0,10);
}
export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value;
}
export function estimatedMinutes(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 15 || value > 60000 || value % 15 !== 0) throw new Error("Estimate must be 15–60,000 minutes in 15-minute increments.");
  return value;
}
export type DayTask = {status:string; priority:string; due_date?:string|null; due_time?:string|null; planned_date?:string|null; review_state?:string|null; dependency_blocked?:boolean; is_delivery_step?:boolean; estimated_minutes?:number|null};
export function taskDeadline(t:DayTask) {
  if (!validDay(t.due_date)) return Infinity;
  const time = typeof t.due_time === "string" && /^([01]\d|2[0-3]):[0-5]\d/.test(t.due_time) ? t.due_time.slice(0,5)+":00" : "23:59:59";
  return Date.parse(t.due_date+"T"+time+"+06:00");
}
export function needsManagement(t:DayTask) {
  return t.review_state === "submitted" || t.review_state === "approved";
}
export function isActionable(t:DayTask) {return t.status !== "Done" && !needsManagement(t) && !t.dependency_blocked;}
export function myDay(t:DayTask, today:string) {
  return isActionable(t) && (t.planned_date===today || Boolean(t.due_date && t.due_date<=today) || t.review_state==="revision_requested" || t.priority==="Urgent" || t.status==="In Progress");
}
export function estimateSummary(tasks:readonly DayTask[]) {
  return tasks.reduce((a,t)=>{if (typeof t.estimated_minutes==="number" && t.estimated_minutes>0) {a.minutes+=t.estimated_minutes;a.estimated++;} else a.unestimated++;return a;},{minutes:0,estimated:0,unestimated:0});
}
