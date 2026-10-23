"use client";

import { useEffect } from "react";

const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export default function MobileInteractionGuard() {
  useEffect(() => {
    let previousFocus: HTMLElement | null = null;
    let enquiryWasOpen = false;
    let frame = 0;

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const publicNavOpen = Boolean(document.querySelector(".public-header .public-nav.open"));
        document.body.classList.toggle("lv-public-nav-open", publicNavOpen);

        const enquiry = document.querySelector<HTMLElement>(".lv-enquiry-modal");
        if (enquiry && !enquiryWasOpen) {
          previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const first = enquiry.querySelector<HTMLElement>(FOCUSABLE);
          first?.focus({ preventScroll: true });
        } else if (!enquiry && enquiryWasOpen) {
          previousFocus?.focus?.({ preventScroll: true });
          previousFocus = null;
        }
        enquiryWasOpen = Boolean(enquiry);

        /* Public portfolio may contain many published projects. Native lazy
           loading/async decoding keeps off-screen project images from competing
           with the visible cards on mobile data connections. */
        document.querySelectorAll<HTMLImageElement>(".portfolio-card img").forEach((image, index) => {
          image.decoding = "async";
          if (index > 1) image.loading = "lazy";
        });
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const enquiry = document.querySelector<HTMLElement>(".lv-enquiry-modal");
      if (event.key === "Tab" && enquiry) {
        const focusable = Array.from(enquiry.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      if (event.key === "Escape") {
        const publicNav = document.querySelector(".public-header .public-nav.open");
        const menuButton = document.querySelector<HTMLButtonElement>(".public-header .public-menu-button");
        if (publicNav && menuButton) menuButton.click();
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("keydown", onKeyDown);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("lv-public-nav-open");
    };
  }, []);

  return null;
}
