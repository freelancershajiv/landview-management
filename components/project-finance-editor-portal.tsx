"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import ProjectFinanceHistoryEditor from "@/components/project-finance-history-editor";

export default function ProjectFinanceEditorPortal() {
  const params = useParams<{ projectId: string }>();
  const projectCode = decodeURIComponent(String(params?.projectId || ""));
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function sync() {
      const editor = document.querySelector("form.pc-edit");
      const actions = editor?.querySelector(".form-actions");
      if (!editor || !actions) {
        if (currentHost?.isConnected) currentHost.remove();
        currentHost = null;
        setHost(null);
        return;
      }
      const existing = editor.querySelector<HTMLElement>("[data-project-finance-editor-host='true']");
      if (existing) {
        currentHost = existing;
        setHost(existing);
        return;
      }
      const node = document.createElement("div");
      node.dataset.projectFinanceEditorHost = "true";
      node.className = "pc-edit-section project-finance-editor-host";
      actions.parentElement?.insertBefore(node, actions);
      currentHost = node;
      setHost(node);
    }

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) currentHost.remove();
      setHost(null);
    };
  }, []);

  if (!host || !projectCode) return null;
  return createPortal(
    <div>
      <div className="pc-edit-section-head" style={{ marginBottom: 12 }}>
        <strong>Billing, payments & ledger history</strong>
        <small>Same full historical controls available during old-project registration.</small>
      </div>
      <ProjectFinanceHistoryEditor projectCode={projectCode} />
    </div>,
    host,
  );
}
