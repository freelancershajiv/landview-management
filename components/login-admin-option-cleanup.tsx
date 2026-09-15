"use client";

import { useEffect } from "react";

export default function LoginAdminOptionCleanup() {
  useEffect(() => {
    const replacements: Array<[string, string]> = [
      ["EMPLOYEE / ADMIN ACCESS", "EMPLOYEE PORTAL"],
      ["Employees sign in with Employee ID. Administrators use the same login with the correct Admin ID and password.", "Employees sign in with their LAND VIEW Employee ID and password."],
      ["EMPLOYEE / ADMIN ID", "EMPLOYEE ID"],
      ["EMP-0001 or admin username", "EMP-0001"],
      ["A single controlled gateway for management, employees and clients. Clients now enter with their Project ID and registered mobile number.", "A controlled gateway for employees and clients. Clients enter with their Project ID and registered mobile number."],
      ["One system.Three workspaces.", "One system.Two login portals."],
      ["One system. Three workspaces.", "One system. Two login portals."],
    ];

    const clean = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const original = node.nodeValue || "";
        let next = original;
        for (const [from, to] of replacements) next = next.replace(from, to);
        if (next !== original) node.nodeValue = next;
      }
      document.querySelectorAll<HTMLInputElement>('input[placeholder="EMP-0001 or admin username"]').forEach((input) => {
        input.placeholder = "EMP-0001";
      });
    };

    clean();
    const observer = new MutationObserver(clean);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
