type StageField = "Design_Stage_Status" | "Approval_Stage_Status" | "Supervision_Stage_Status";

const STAGE_LABELS: Record<StageField, string> = {
  Design_Stage_Status: "Design Stage",
  Approval_Stage_Status: "Approval Stage",
  Supervision_Stage_Status: "Supervision / Construction Stage",
};

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

async function queueClientProjectMessage(input: { projectId: string; message: string; dedupeKey: string; source: string }) {
  const response = await fetch("/api/admin/whatsapp/client", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "project-update",
      projectCode: input.projectId,
      message: input.message,
      dedupeKey: input.dedupeKey,
      source: input.source,
    }),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Client WhatsApp update could not be queued."));
  return json.data;
}

function portalFooter() {
  return "You can view your latest project information in the LAND VIEW Client Portal:\nhttps://app.landview.com.bd/client";
}

export async function notifyClientProjectStage(input: {
  projectId: string;
  projectName?: unknown;
  clientName?: unknown;
  field: StageField;
  value: unknown;
}) {
  const projectId = text(input.projectId, 80);
  const projectName = text(input.projectName, 220);
  const clientName = text(input.clientName, 180);
  const status = text(input.value, 100);
  const stage = STAGE_LABELS[input.field];
  if (!projectId || !status) return null;

  const lines = [
    "🏗️ *LAND VIEW — PROJECT UPDATE*",
    `*File ID:* ${projectId}`,
    projectName ? `*Project:* ${projectName}` : "",
    clientName ? `*Client:* ${clientName}` : "",
    `*${stage}:* ${status}`,
    "",
    portalFooter(),
  ].filter(Boolean);

  return queueClientProjectMessage({
    projectId,
    message: lines.join("\n"),
    dedupeKey: `project-stage:${projectId}:${input.field}:${status}:${Date.now()}`,
    source: "project-stage",
  });
}

export async function notifyClientWorkflowService(input: { projectId: string; projectName?: unknown; serviceTitle: unknown }) {
  const projectId = text(input.projectId, 80);
  const projectName = text(input.projectName, 220);
  const serviceTitle = text(input.serviceTitle, 220);
  if (!projectId || !serviceTitle) return null;
  const lines = [
    "✅ *LAND VIEW — SERVICE COMPLETED*",
    `*File ID:* ${projectId}`,
    projectName ? `*Project:* ${projectName}` : "",
    `*Completed Service:* ${serviceTitle}`,
    "",
    portalFooter(),
  ].filter(Boolean);
  return queueClientProjectMessage({
    projectId,
    message: lines.join("\n"),
    dedupeKey: `workflow-complete:${projectId}:${serviceTitle}:${Date.now()}`,
    source: "workflow",
  });
}

export async function notifyClientWorkflowComplete(input: { projectId: string; projectName?: unknown; completedCount: number }) {
  const projectId = text(input.projectId, 80);
  const projectName = text(input.projectName, 220);
  if (!projectId) return null;
  const count = Math.max(1, Math.trunc(Number(input.completedCount || 1)));
  const lines = [
    "🎉 *LAND VIEW — PROJECT WORKFLOW UPDATE*",
    `*File ID:* ${projectId}`,
    projectName ? `*Project:* ${projectName}` : "",
    `*Update:* ${count} remaining service${count === 1 ? "" : "s"} completed.`,
    "*Workflow Progress:* 100%",
    "",
    portalFooter(),
  ].filter(Boolean);
  return queueClientProjectMessage({
    projectId,
    message: lines.join("\n"),
    dedupeKey: `workflow-project-complete:${projectId}:${Date.now()}`,
    source: "workflow",
  });
}
