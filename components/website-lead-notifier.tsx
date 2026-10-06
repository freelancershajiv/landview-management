"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Summary = { newCount?: number; overdueFollowUps?: number; dueToday?: number };

export default function WebsiteLeadNotifier() {
  const pathname = usePathname() || "/";
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!pathname.startsWith("/admin")) {
      setSummary(null);
      return;
    }
    let active = true;
    let timer: number | undefined;

    async function load() {
      try {
        const response = await fetch("/api/admin/website-leads?summary=1", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) {
          if (active) setSummary(null);
          return;
        }
        const json = await response.json();
        if (active && json?.success) setSummary(json.data || {});
      } catch {
        if (active) setSummary(null);
      }
    }

    void load();
    timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [pathname]);

  const newCount = Number(summary?.newCount || 0);
  const overdue = Number(summary?.overdueFollowUps || 0);
  const dueToday = Number(summary?.dueToday || 0);
  if (!summary || (!newCount && !overdue && !dueToday) || pathname === "/admin/website-leads") return null;

  return (
    <Link className="lv-lead-notifier" href="/admin/website-leads" aria-label="Open website enquiries">
      <span className="lv-lead-notifier-dot" />
      <span><strong>{newCount ? `${newCount} new website ${newCount === 1 ? "enquiry" : "enquiries"}` : "Website follow-up due"}</strong><small>{overdue ? `${overdue} overdue` : dueToday ? `${dueToday} due today` : "Open lead inbox"}</small></span>
      <b>→</b>
      <style>{`
        .lv-lead-notifier{position:fixed;right:18px;top:96px;z-index:900;display:flex;align-items:center;gap:10px;min-width:250px;max-width:330px;padding:11px 13px;border:1px solid rgba(214,31,38,.32);border-radius:11px;background:rgba(18,27,35,.97);color:#fff!important;text-decoration:none;box-shadow:0 16px 34px rgba(0,0,0,.28);backdrop-filter:blur(12px)}
        .lv-lead-notifier:hover{border-color:#d61f26;transform:translateY(-1px)}.lv-lead-notifier-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#ef4a50;box-shadow:0 0 0 5px rgba(239,74,80,.12)}
        .lv-lead-notifier span:nth-child(2){display:grid;gap:3px;min-width:0;flex:1}.lv-lead-notifier strong{font-size:11px;line-height:1.25}.lv-lead-notifier small{color:#9eabb5;font-size:9px}.lv-lead-notifier b{color:#ef4a50}
        @media(max-width:700px){.lv-lead-notifier{left:12px;right:12px;top:auto;bottom:12px;max-width:none;min-width:0}}
      `}</style>
    </Link>
  );
}
