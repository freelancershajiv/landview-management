"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HREF = "/admin/municipality-accounts";

export default function MunicipalityAccountsNavLink() {
  const pathname = usePathname();

  useEffect(() => {
    let disposed = false;
    let scheduled = false;

    function install() {
      if (disposed) return;
      document.querySelectorAll<HTMLElement>(".primary-nav-inner").forEach((nav) => {
        let link = nav.querySelector<HTMLAnchorElement>(`a[data-municipality-accounts-nav="true"]`);
        if (!link) {
          link = document.createElement("a");
          link.href = HREF;
          link.dataset.municipalityAccountsNav = "true";
          const icon = document.createElement("span");
          icon.className = "nav-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = "▦";
          const label = document.createElement("span");
          label.textContent = "Municipality Accounts";
          link.append(icon, label);

          const ledger = nav.querySelector<HTMLAnchorElement>('a[href="/admin/accounts"]');
          if (ledger?.nextSibling) nav.insertBefore(link, ledger.nextSibling);
          else if (ledger) nav.appendChild(link);
          else nav.appendChild(link);
        }
        const active = pathname === HREF || pathname.startsWith(`${HREF}/`);
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }

    function schedule() {
      if (scheduled || disposed) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        install();
      }, 0);
    }

    install();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
