"use client";

import Link from "next/link";
import { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <section className="page-head page-hero">
      <div className="page-hero-copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-head-action">{action}</div>}
    </section>
  );
}

export function StatCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: string }) {
  return (
    <div className="stat-card service-stat-card">
      <div className="stat-card-top">
        <span>{label}</span>
        <b>{icon || "↗"}</b>
      </div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}

export function StatusBadge({ value }: { value?: unknown }) {
  const text = String(value || "—");
  const v = text.toLowerCase();
  const kind = v.includes("active") || v.includes("ongoing") || v.includes("paid") || v.includes("complete")
    ? "good"
    : v.includes("pending") || v.includes("progress") || v.includes("due")
      ? "warn"
      : v.includes("inactive") || v.includes("cancel") || v.includes("overdue")
        ? "bad"
        : "neutral";
  return <span className={`status-badge ${kind}`}>{text}</span>;
}

export function EmptyState({ title, text, href, action }: { title: string; text: string; href?: string; action?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">LV</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {href && action && <Link className="btn btn-dark" href={href}>{action}</Link>}
    </div>
  );
}

export function LoadingState({ label = "Loading workspace..." }: { label?: string }) {
  return <div className="loading-state"><div className="spinner"/><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="notice error"><strong>Unable to load</strong><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}>Try again</button>}</div>;
}

export function Money({ value }: { value: unknown }) {
  const n = Number(String(value ?? 0).replace(/,/g, "")) || 0;
  return <>৳{new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}</>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function pick(obj: Record<string, any> | undefined | null, keys: string[], fallback = "") {
  if (!obj) return fallback;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return fallback;
}

export function formatDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}
