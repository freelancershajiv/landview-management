"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TodoItem } from "@/lib/todo-data";
import { clientDocumentChecklist } from "@/lib/client-document-checklist";
import { workItemHref, workScope, workScopeQuery, workTaskHref } from "@/lib/work-task-links";

type WorkItem = Pick<TodoItem, "todo_code" | "title" | "status" | "priority" | "due_date" |
  "assigned_employee_id" | "assigned_to" | "dependency_todo_code" | "review_required" | "review_state">;

type DeliveryBalance = {
  id: string;
  serviceName: string;
  status: string;
  nextStatus?: string;
  delivered: boolean;
  deliveryDue: number;
  deliveryLocked: boolean;
};
type DocumentStatus = ReturnType<typeof clientDocumentChecklist>;
const money = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });

async function loadList(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error("Project data unavailable");
  return result.data;
}

const priorityRank = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function ProjectNextAction({ projectId, openDocuments }: {
  projectId: string;
  openDocuments: () => void;
}) {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [documents, setDocuments] = useState<DocumentStatus | "unavailable" | null>(null);
  const [delivery, setDelivery] = useState<DeliveryBalance[] | "unavailable" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setFailed(false);
    setDocuments(null);
    setDelivery(null);
    const scope = workScope("project", projectId);
    if (!scope) {
      setFailed(true);
      return;
    }
    const query = workScopeQuery(scope);
    const { signal } = controller;
    const code = encodeURIComponent(scope.code);
    loadList(`/api/admin/todo?${query}`, signal)
      .then((data) => { if (!signal.aborted) setItems(data); })
      .catch(() => { if (!signal.aborted) setFailed(true); });
    loadList(`/api/registers?projectDocuments=${code}`, signal)
      .then((data) => { if (!signal.aborted) setDocuments(clientDocumentChecklist(data)); })
      .catch(() => { if (!signal.aborted) setDocuments("unavailable"); });
    loadList(`/api/service-workflow?mode=project-delivery&projectId=${code}`, signal)
      .then((data) => { if (!signal.aborted) setDelivery(data); })
      .catch(() => { if (!signal.aborted) setDelivery("unavailable"); });
    return () => controller.abort();
  }, [projectId, attempt]);

  const byCode = new Map(items?.map((item) => [item.todo_code, item]));
  const open = (items ?? []).filter((item) => item.status !== "Done")
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      Number(b.status === "In Progress") - Number(a.status === "In Progress") ||
      a.todo_code.localeCompare(b.todo_code));
  const next = open[0];
  const scope = workScope("project", projectId);
  const taskHref = next ? workItemHref(next.todo_code) : scope ? workTaskHref(scope) : "/admin/todo";
  const predecessor = next?.dependency_todo_code ? byCode.get(next.dependency_todo_code) : undefined;
  const blockers = next ? [
    next.dependency_todo_code && predecessor?.status !== "Done"
      ? (predecessor ? `Complete ${predecessor.title} first` : `Check predecessor ${next.dependency_todo_code}`)
      : null,
    next.review_required && next.review_state !== "approved"
      ? next.review_state === "revision_requested" ? "Revision requested"
        : next.review_state === "submitted" ? "Awaiting review" : "Review required before completion"
      : null,
    !next.assigned_employee_id && !next.assigned_to ? "Assign an owner" : null,
  ].filter((item): item is string => Boolean(item)) : [];
  const deadline = next?.due_date ? new Date(`${next.due_date.slice(0, 10)}T00:00:00Z`) : null;

  return (
    <section className="pc-panel" aria-labelledby="pc-next-action">
      <div className="pc-panel-head">
        <h2 id="pc-next-action">Next Action &amp; Blockers</h2>
        {items && <span className="pc-badge">{open.length} open</span>}
      </div>
      {failed ? (
        <p className="pc-note">Could not load project tasks.{" "}
          <button className="btn btn-small" data-lv-button="secondary" type="button" onClick={() => setAttempt(attempt + 1)}>Retry</button>
        </p>
      ) : !items ? <p role="status" className="pc-note">Loading project tasks…</p>
        : !next ? <p className="pc-note">No open project tasks.</p>
        : <>
          <h3>{next.title}</h3>
          <p className="pc-note">
            Owner: {next.assigned_to || (next.assigned_employee_id ? "Assigned in To Do" : "Unassigned")} ·{" "}
            Due: {deadline && Number.isFinite(deadline.getTime()) ? dateLabel.format(deadline) : "No deadline"}
          </p>
          {blockers.length > 0 && <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
        </>}
      <div className="pc-two">
        <section aria-labelledby="pc-client-docs">
          <h3 id="pc-client-docs">Client documents</h3>
          {documents === "unavailable" ? <p className="pc-note">Document register unavailable.</p>
            : documents ? <ul>{documents.map(({ name, status }) => <li key={name}>{name} · <strong>{status}</strong></li>)}</ul>
            : <p role="status" className="pc-note">Loading document checklist…</p>}
          <Link className="btn btn-small" data-lv-button="secondary" href={`/admin/registers?fileId=${encodeURIComponent(scope?.code || projectId)}`}>Open document register</Link>
        </section>
        <section aria-labelledby="pc-delivery-clearance">
          <h3 id="pc-delivery-clearance">Service handoff</h3>
          {delivery === "unavailable" ? <p className="pc-note">Service handoff unavailable.</p>
            : delivery ? delivery.length ? <ul>{delivery.map((service) => {
              const project = encodeURIComponent(scope?.code || projectId);
              const workflow = encodeURIComponent(service.id);
              return (
                <li key={service.id}>
                  <strong>{service.serviceName}</strong> · {service.status}
                  {!service.delivered && service.nextStatus && <div>Next workflow step · {service.nextStatus}</div>}
                  {!service.delivered && service.deliveryLocked &&
                    <div>Payment hold · <strong>৳{money.format(service.deliveryDue)}</strong> remaining in workflow</div>}
                  <div className="pc-actions" style={{ flexWrap: "wrap" }}>
                    <Link href={`/admin/project-operations/by-project?project=${project}&workflow=${workflow}`}>Open workflow</Link>
                    <Link href={`/admin/project-operations/document-register?workflowId=${workflow}`}>Service documents</Link>
                  </div>
                </li>
              );
            })}</ul> : <p className="pc-note">No active service workflows.</p>
            : <p role="status" className="pc-note">Loading service handoff…</p>}
          <p className="pc-note">Issued bills allow work to start. The system checks verified payment when staff record final delivery.</p>
          <Link className="btn btn-small" data-lv-button="secondary" href={`/admin/billing/bills?fileId=${encodeURIComponent(scope?.code || projectId)}`}>Open project bills</Link>
        </section>
      </div>
      {(documents === "unavailable" || delivery === "unavailable") && !failed &&
        <button className="btn btn-small" data-lv-button="secondary" type="button" onClick={() => setAttempt(attempt + 1)}>Retry checks</button>}
      <div className="pc-actions" style={{ flexWrap: "wrap" }}>
        <Link className="btn btn-small" data-lv-button="secondary" href={taskHref}>{next ? "Open task" : "Open To Do"}</Link>
        <button className="btn btn-small" data-lv-button="secondary" type="button" onClick={openDocuments}>Check documents</button>
      </div>
    </section>
  );
}
