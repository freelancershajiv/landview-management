"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function normalizeProjectId(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (!match?.[1]) return "";
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? `LV-${String(number).padStart(3, "0")}` : "";
}

function projectIdFromChip(target: EventTarget | null) {
  if (!(target instanceof Element)) return "";
  const chip = target.closest(".missing-chip");
  if (!chip) return "";
  return normalizeProjectId(chip.textContent);
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ProjectLegacyNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/admin/projects/missing-serials") return;

    const prepareChips = () => {
      document.querySelectorAll<HTMLElement>(".missing-chip").forEach((chip) => {
        chip.style.cursor = "pointer";
        chip.setAttribute("role", "link");
        chip.setAttribute("tabindex", "0");
        chip.setAttribute("title", `Open ${normalizeProjectId(chip.textContent)} in Legacy Project Editor`);
      });
    };

    const openChip = (target: EventTarget | null) => {
      const id = projectIdFromChip(target);
      if (!id) return false;
      router.push(`/admin/projects/legacy?projectId=${encodeURIComponent(id)}&mode=editor`);
      return true;
    };

    const onClick = (event: MouseEvent) => {
      if (openChip(event.target)) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (openChip(event.target)) event.preventDefault();
    };

    prepareChips();
    const observer = new MutationObserver(prepareChips);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pathname, router]);

  useEffect(() => {
    if (pathname !== "/admin/projects/legacy") return;
    const id = normalizeProjectId(new URLSearchParams(window.location.search).get("projectId"));
    if (!id) return;

    let cancelled = false;
    let attempts = 0;
    const prefill = () => {
      if (cancelled) return;
      const input = document.querySelector<HTMLInputElement>('input[placeholder="LV-069"]');
      if (!input) {
        attempts += 1;
        if (attempts < 30) window.setTimeout(prefill, 100);
        return;
      }

      if (input.value !== id) setReactInputValue(input, id);
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        const projectName = document.querySelector<HTMLInputElement>('input[required]:not([placeholder="LV-069"])');
        projectName?.focus();
      }, 180);
    };

    prefill();
    return () => { cancelled = true; };
  }, [pathname]);

  const detailMatch = decodeURIComponent(pathname).match(/^\/admin\/projects\/(LV[\s_-]*0*\d+)$/i);
  const detailProjectId = detailMatch ? normalizeProjectId(detailMatch[1]) : "";
  if (!detailProjectId) return null;

  return <div style={{display:"flex",justifyContent:"flex-end",margin:"0 0 10px"}}>
    <Link
      href={`/admin/projects/payment-routing?projectId=${encodeURIComponent(detailProjectId)}`}
      style={{height:36,padding:"0 12px",border:"1px solid rgba(82,112,90,.7)",borderRadius:8,background:"#18281f",color:"#a9deb8",textDecoration:"none",fontSize:10,fontWeight:900,display:"inline-flex",alignItems:"center"}}
    >Edit {detailProjectId} Payments / Municipality Routing</Link>
  </div>;
}
