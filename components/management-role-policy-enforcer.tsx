"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hideButtonByText(root: ParentNode, labels: string[]) {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const label = String(button.textContent || "").trim().toLowerCase();
    if (wanted.has(label)) {
      button.style.setProperty("display", "none", "important");
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    }
  });
}

export default function ManagementRolePolicyEnforcer({ role: roleValue }: { role?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = normalizeRole(roleValue);

  useEffect(() => {
    if (role !== "manager") return;

    const blocked = pathname === "/admin/access" || pathname.startsWith("/admin/access/") ||
      pathname === "/admin/accounts/entry" || pathname.startsWith("/admin/accounts/entry/");
    if (blocked) {
      router.replace("/admin");
      return;
    }

    const apply = () => {
      if (pathname === "/admin/accounts" || pathname.startsWith("/admin/accounts/")) {
        document.querySelectorAll<HTMLElement>(".ledger-edit-btn,.ledger-drag-handle,[data-ledger-order-added='true']").forEach((element) => {
          element.style.setProperty("display", "none", "important");
        });
      }

      if (pathname === "/admin/employees" || pathname.startsWith("/admin/employees/")) {
        document.querySelectorAll<HTMLElement>(".employee-actions").forEach((element) => {
          element.style.setProperty("display", "none", "important");
        });
        hideButtonByText(document, ["+ Add employee", "Add employee", "Save employee", "Delete"]);
      }

      if (pathname === "/admin/municipality-accounts" || pathname.startsWith("/admin/municipality-accounts/")) {
        hideButtonByText(document, ["Send to Main Ledger", "Sending…", "Edit"]);
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, role, router]);

  return null;
}
