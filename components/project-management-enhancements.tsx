"use client";

import { useEffect } from "react";

function enhanceProjectRegister() {
  if (window.location.pathname !== "/admin/projects") return;
  const rows = document.querySelectorAll<HTMLTableRowElement>(".project-table tbody tr:not(.team-row)");
  rows.forEach((row) => {
    const main = row.querySelector<HTMLElement>(".project-main");
    const idNode = row.querySelector<HTMLElement>(".project-id");
    if (!main || !idNode || main.querySelector(".lv-project-edit-link")) return;
    const projectId = String(idNode.textContent || "").trim();
    if (!projectId) return;
    const link = document.createElement("a");
    link.className = "lv-project-edit-link";
    link.href = `/admin/projects/${encodeURIComponent(projectId)}?edit=1`;
    link.textContent = "Edit";
    link.setAttribute("aria-label", `Edit ${projectId}`);
    main.appendChild(link);
  });
}

function openRequestedEditor() {
  if (!/^\/admin\/projects\/[^/]+$/.test(window.location.pathname)) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("edit") !== "1") return;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const editButton = buttons.find((button) => /edit project/i.test(String(button.textContent || "")));
  if (editButton && !editButton.dataset.lvAutoOpened) {
    editButton.dataset.lvAutoOpened = "1";
    editButton.click();
  }
}

export default function ProjectManagementEnhancements() {
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.lvProjectEnhancements = "1";
    style.textContent = `
      .lv-project-edit-link{height:30px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#18232d;color:#fff!important;font-size:10px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;margin-left:auto;white-space:nowrap}
      .lv-project-edit-link:hover{border-color:#d61f26;color:#ff8179!important}
      @media(max-width:760px){.lv-project-edit-link{margin-left:0}}
    `;
    document.head.appendChild(style);

    const run = () => {
      enhanceProjectRegister();
      openRequestedEditor();
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(run, 800);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      style.remove();
    };
  }, []);
  return null;
}
