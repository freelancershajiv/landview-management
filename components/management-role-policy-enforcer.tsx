"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasCapability } from "@/lib/permissions";

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hideButtons(labels: string[]) {
  const wanted = labels.map((label) => label.toLowerCase());
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const text = String(button.textContent || "").trim().toLowerCase();
    if (wanted.some((label) => text === label || text.startsWith(label))) {
      button.style.setProperty("display", "none", "important");
      button.tabIndex = -1;
    }
  });
}

export default function ManagementRolePolicyEnforcer({ role: rawRole }: { role?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = normalizeRole(rawRole);

  useEffect(() => {
    if (!role || role === "admin") return;

    const blockedRoutes: Array<[string, Parameters<typeof hasCapability>[1]]> = [
      ["/admin/access", "access.manage"],
      ["/admin/accounts/entry", "accounts.createEntry"],
      ["/admin/security", "security.manage"],
      ["/admin/whatsapp", "whatsapp.manage"],
      ["/admin/website-curation", "website.manage"],
    ];

    const blocked = blockedRoutes.some(([prefix, capability]) =>
      (pathname === prefix || pathname.startsWith(`${prefix}/`)) && !hasCapability(role, capability)
    );
    if (blocked) {
      router.replace("/admin");
      return;
    }

    const apply = () => {
      if (pathname === "/admin/accounts" || pathname.startsWith("/admin/accounts/")) {
        if (!hasCapability(role, "accounts.reorder")) {
          document.querySelectorAll<HTMLElement>(".ledger-drag-handle,[data-ledger-order-added='true']")
            .forEach((element) => element.style.setProperty("display", "none", "important"));
          hideButtons(["Reorder"]);
        }
        if (!hasCapability(role, "accounts.edit")) {
          document.querySelectorAll<HTMLElement>(".ledger-edit-btn")
            .forEach((element) => element.style.setProperty("display", "none", "important"));
          hideButtons(["Edit", "Void"]);
        }
        if (!hasCapability(role, "accounts.delete")) hideButtons(["Delete"]);
      }

      if (pathname === "/admin/employees" || pathname.startsWith("/admin/employees/")) {
        if (!hasCapability(role, "employees.manage")) {
          document.querySelectorAll<HTMLElement>(".employee-actions")
            .forEach((element) => element.style.setProperty("display", "none", "important"));
          hideButtons(["+ Add employee", "Add employee", "Save employee", "Delete"]);
        }
        if (!hasCapability(role, "employees.manageRole")) {
          hideButtons(["Promote to Manager", "Demote to Employee"]);
        }
      }

      if (pathname === "/admin/municipality-accounts" || pathname.startsWith("/admin/municipality-accounts/")) {
        if (!hasCapability(role, "municipalityAccounts.transfer")) hideButtons(["Send to Main Ledger", "Sending…"]);
        if (!hasCapability(role, "municipalityAccounts.edit")) hideButtons(["Edit"]);
      }

      if ((pathname === "/admin/projects" || pathname.startsWith("/admin/projects/")) && !hasCapability(role, "projects.delete")) {
        hideButtons(["Delete project"]);
      }

      if ((pathname === "/admin/certificates" || pathname.startsWith("/admin/certificates/")) && !hasCapability(role, "certificates.issue")) {
        document.querySelectorAll<HTMLElement>(".cert-submit")
          .forEach((element) => element.style.setProperty("display", "none", "important"));
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, role, router]);

  return null;
}
