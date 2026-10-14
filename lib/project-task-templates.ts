export type ResponsibilityLifecycleStage =
  | "Design Stage"
  | "Approval Stage"
  | "Supervision / Construction Stage"
  | "Handover";

export type ResponsibilityTaskTemplate = {
  key: string;
  title: string;
  stage: ResponsibilityLifecycleStage;
  type: string;
  dueInDays: number;
  dependencyKey?: string;
  priority?: "Low" | "Normal" | "High" | "Urgent";
  clientVisible?: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[–—_\/]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ");
}

export function taskKeyPart(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

const SERVICES: Array<{ title: string; aliases: string[] }> = [
  { title: "Architectural Design", aliases: ["architectural design", "architectural", "architect design", "architecture design"] },
  { title: "Structural Design", aliases: ["structural design", "structural"] },
  { title: "3D Design - Exterior", aliases: ["3d design exterior", "3d exterior", "exterior 3d", "3d exterior design", "3d design"] },
  { title: "3D Design - Interior", aliases: ["3d design interior", "3d interior", "interior 3d", "3d interior design"] },
  { title: "Electrical Design", aliases: ["electrical design", "electrical"] },
  { title: "Fire Safety Design", aliases: ["fire safety design", "fire design", "fire safety"] },
  { title: "Plumbing Design", aliases: ["plumbing design", "plumbing"] },
  { title: "Plan Approval Design", aliases: ["plan approval design", "approval design"] },
  { title: "Estimate & Costing", aliases: ["estimate and costing", "estimate costing", "cost estimate", "estimation and costing", "estimation costing"] },
  { title: "Design Books", aliases: ["design books", "design book"] },
  { title: "Re-Design Fees", aliases: ["re design fees", "redesign fees", "redesign"] },
  { title: "Municipality Land NOC", aliases: ["municipality land noc", "land noc"] },
  { title: "Fire Service Approval", aliases: ["fire service approval", "fire approval"] },
  { title: "Municipality Approval", aliases: ["municipality approval", "municipal approval", "municipality file pass", "file pass", "plan pass"] },
  { title: "District Vetting Committee Approval", aliases: ["district vetting committee approval", "vetting committee approval", "district vetting"] },
  { title: "Soil Test", aliases: ["soil test", "soil testing", "soil investigation"] },
  { title: "Digital Survey", aliases: ["digital survey", "measurement digital survey", "measurement survey", "land survey"] },
  { title: "Site Supervision", aliases: ["site supervision", "construction supervision", "supervision bill", "supervision"] },
];

export function canonicalProjectService(value: unknown) {
  const raw = normalize(value).replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  for (const service of SERVICES) {
    for (const aliasValue of [service.title, ...service.aliases]) {
      const alias = normalize(aliasValue);
      if (raw === alias || raw.includes(alias) || alias.includes(raw)) return service.title;
    }
  }
  return "";
}

const DESIGN_STANDARD: ResponsibilityTaskTemplate[] = [
  { key: "prepare", title: "Prepare initial design", stage: "Design Stage", type: "Preparation", dueInDays: 3, priority: "Normal" },
  { key: "internal-review", title: "Internal design review", stage: "Design Stage", type: "Internal Review", dueInDays: 5, dependencyKey: "prepare", priority: "High" },
  { key: "client-review", title: "Client review / feedback", stage: "Design Stage", type: "Client Review", dueInDays: 7, dependencyKey: "internal-review", priority: "Normal", clientVisible: true },
  { key: "final-issue", title: "Revision and final issue", stage: "Design Stage", type: "Final Issue", dueInDays: 10, dependencyKey: "client-review", priority: "High", clientVisible: true },
];

function designTasks(label: string, options?: { clientReview?: boolean }) {
  const useClientReview = options?.clientReview !== false;
  const rows = useClientReview ? DESIGN_STANDARD : DESIGN_STANDARD.filter((row) => row.key !== "client-review");
  return rows.map((row, index, all) => ({
    ...row,
    title: `${label}: ${row.title}`,
    dependencyKey: row.dependencyKey === "client-review" && !useClientReview ? "internal-review" : row.dependencyKey,
    dueInDays: useClientReview ? row.dueInDays : [3, 5, 8][index] ?? row.dueInDays,
  }));
}

function approvalTasks(label: string, authority: string): ResponsibilityTaskTemplate[] {
  return [
    { key: "prepare", title: `${label}: Prepare drawings & documents`, stage: "Approval Stage", type: "Preparation", dueInDays: 3, priority: "High" },
    { key: "submit", title: `${label}: Submit to ${authority}`, stage: "Approval Stage", type: "Submission", dueInDays: 5, dependencyKey: "prepare", priority: "High", clientVisible: true },
    { key: "follow-up", title: `${label}: Follow-up / corrections`, stage: "Approval Stage", type: "Follow-up", dueInDays: 12, dependencyKey: "submit", priority: "Normal", clientVisible: true },
    { key: "close", title: `${label}: Record final approval`, stage: "Approval Stage", type: "Approval", dueInDays: 20, dependencyKey: "follow-up", priority: "High", clientVisible: true },
  ];
}

export function responsibilityTasksForService(serviceValue: unknown): ResponsibilityTaskTemplate[] {
  const service = canonicalProjectService(serviceValue);
  if (!service) return [];

  if (["Architectural Design", "Structural Design", "3D Design - Exterior", "3D Design - Interior", "Electrical Design", "Fire Safety Design", "Plumbing Design", "Re-Design Fees"].includes(service)) {
    return designTasks(service);
  }
  if (service === "Plan Approval Design") return designTasks(service, { clientReview: false });
  if (service === "Estimate & Costing") {
    return [
      { key: "takeoff", title: "Estimate & Costing: Quantity take-off", stage: "Design Stage", type: "Quantity Take-off", dueInDays: 4, priority: "Normal" },
      { key: "estimate", title: "Estimate & Costing: Prepare estimate", stage: "Design Stage", type: "Preparation", dueInDays: 7, dependencyKey: "takeoff", priority: "High" },
      { key: "review", title: "Estimate & Costing: Internal review", stage: "Design Stage", type: "Internal Review", dueInDays: 9, dependencyKey: "estimate", priority: "High" },
      { key: "final", title: "Estimate & Costing: Final issue", stage: "Design Stage", type: "Final Issue", dueInDays: 10, dependencyKey: "review", priority: "Normal", clientVisible: true },
    ];
  }
  if (service === "Design Books") {
    return [
      { key: "compile", title: "Design Books: Compile final set", stage: "Design Stage", type: "Compilation", dueInDays: 3, priority: "Normal" },
      { key: "qa", title: "Design Books: QA and completeness check", stage: "Design Stage", type: "Internal Review", dueInDays: 5, dependencyKey: "compile", priority: "High" },
      { key: "deliver", title: "Design Books: Issue / deliver", stage: "Design Stage", type: "Delivery", dueInDays: 6, dependencyKey: "qa", priority: "Normal", clientVisible: true },
    ];
  }
  if (service === "Municipality Land NOC") return approvalTasks(service, "Municipality");
  if (service === "Municipality Approval") return approvalTasks(service, "Municipality");
  if (service === "Fire Service Approval") return approvalTasks(service, "Fire Service");
  if (service === "District Vetting Committee Approval") return approvalTasks(service, "District Vetting Committee");
  if (service === "Soil Test") {
    return [
      { key: "schedule", title: "Soil Test: Schedule field investigation", stage: "Design Stage", type: "Scheduling", dueInDays: 2, priority: "High" },
      { key: "field", title: "Soil Test: Complete field test", stage: "Design Stage", type: "Field Work", dueInDays: 5, dependencyKey: "schedule", priority: "High" },
      { key: "report", title: "Soil Test: Receive / review report", stage: "Design Stage", type: "Reporting", dueInDays: 10, dependencyKey: "field", priority: "Normal", clientVisible: true },
    ];
  }
  if (service === "Digital Survey") {
    return [
      { key: "schedule", title: "Digital Survey: Schedule site measurement", stage: "Design Stage", type: "Scheduling", dueInDays: 2, priority: "Normal" },
      { key: "field", title: "Digital Survey: Complete site survey", stage: "Design Stage", type: "Field Work", dueInDays: 4, dependencyKey: "schedule", priority: "High" },
      { key: "report", title: "Digital Survey: Prepare final survey report", stage: "Design Stage", type: "Reporting", dueInDays: 6, dependencyKey: "field", priority: "Normal", clientVisible: true },
    ];
  }
  if (service === "Site Supervision") {
    return [
      { key: "setup", title: "Site Supervision: Assign site responsibility & setup", stage: "Supervision / Construction Stage", type: "Setup", dueInDays: 2, priority: "High" },
    ];
  }
  return [];
}

export function responsibilityAutomationKey(projectCode: string, service: string, templateKey: string) {
  return `RESP::${String(projectCode || "").trim().toUpperCase()}::${taskKeyPart(service)}::${taskKeyPart(templateKey)}`;
}

export function isTaskClosedStatus(value: unknown) {
  return new Set(["completed", "done", "closed", "cancelled", "canceled", "approved", "issued"]).has(normalize(value));
}
