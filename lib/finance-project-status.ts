import { selectRows } from "@/lib/supabase-data";

function text(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export async function getFinanceProjectState(projectCode: string) {
  const code = text(projectCode, 80).toUpperCase();
  if (!code) return { exists: false, closed: false, project: null as Record<string, any> | null };
  const rows = await selectRows("projects", { filters: { project_code: code }, limit: 1 });
  const project = rows[0] || null;
  return { exists: Boolean(project), closed: Boolean(project?.finance_closed), project };
}

export async function assertFinanceProjectOpen(projectCode: string) {
  const state = await getFinanceProjectState(projectCode);
  if (!state.exists) throw new Error(`Project ${String(projectCode || "").trim().toUpperCase()} was not found.`);
  if (state.closed) throw new Error(`${String(projectCode || "").trim().toUpperCase()} is completed in Finance. Reopen it from Finance → Projects before making financial changes.`);
  return state.project!;
}
