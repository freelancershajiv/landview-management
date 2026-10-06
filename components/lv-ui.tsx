"use client";

import Link from "next/link";
import { cloneElement, isValidElement, ReactElement, ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const [locating, setLocating] = useState(false);
  const [normalizingTag, setNormalizingTag] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  const normalizedLabel = label.trim().toUpperCase();
  const isProjectEditor = /^\/admin\/projects\/(?!new(?:\/|$)|legacy(?:\/|$)|reclassify(?:\/|$))[^/]+\/?$/.test(pathname || "");
  const isProjectAddress = isProjectEditor && normalizedLabel === "LOCATION";
  const isProjectLocationTag = isProjectEditor && normalizedLabel === "LOCATION TAG";
  const isProjectCoordinate = isProjectEditor && (normalizedLabel === "SITE LATITUDE" || normalizedLabel === "SITE LONGITUDE");
  const displayLabel = isProjectAddress ? "ADDRESS" : label;

  useEffect(() => {
    if (!isProjectCoordinate || typeof window === "undefined") return;
    if (!isValidElement<{ onChange?: (event: any) => void }>(children) || typeof children.props.onChange !== "function") return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ latitude?: number; longitude?: number }>).detail || {};
      const value = normalizedLabel === "SITE LATITUDE" ? detail.latitude : detail.longitude;
      if (!Number.isFinite(Number(value))) return;
      const text = String(value);
      children.props.onChange?.({ target: { value: text }, currentTarget: { value: text } });
    };

    window.addEventListener("landview-project-location", handler as EventListener);
    return () => window.removeEventListener("landview-project-location", handler as EventListener);
  }, [children, isProjectCoordinate, normalizedLabel]);

  async function normalizeLocationTag(value: string) {
    const raw = String(value || "").trim();
    if (!raw || normalizingTag) return;
    if (!/(?:maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+\/maps|google\.com\/maps)/i.test(raw)) return;
    if (!isValidElement<{ onChange?: (event: any) => void }>(children) || typeof children.props.onChange !== "function") return;

    setNormalizingTag(true);
    setLocationMessage("Resolving Location Tag…");
    try {
      const response = await fetch("/api/projects/resolve-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ location: raw }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not resolve that Google Maps link.");
      const latitude = Number(json.data?.latitude);
      const longitude = Number(json.data?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Google Maps did not return valid coordinates.");

      const mapUrl = `https://www.google.com/maps?q=${Number(latitude.toFixed(8))},${Number(longitude.toFixed(8))}`;
      children.props.onChange?.({ target: { value: mapUrl }, currentTarget: { value: mapUrl } });
      window.dispatchEvent(new CustomEvent("landview-project-location", { detail: { latitude, longitude } }));
      setLocationMessage("Location Tag converted to exact coordinates. Save the project to publish the updated pin.");
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : "Could not convert this Location Tag.");
    } finally {
      setNormalizingTag(false);
    }
  }

  function useCurrentLocation() {
    if (locating) return;
    setLocationMessage("");

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setLocationMessage("Current location requires a secure HTTPS connection.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationMessage("Current location is not available in this browser.");
      return;
    }
    if (!isValidElement<{ onChange?: (event: any) => void }>(children) || typeof children.props.onChange !== "function") {
      setLocationMessage("This location tag cannot be updated automatically.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = Number(position.coords.latitude.toFixed(8));
        const longitude = Number(position.coords.longitude.toFixed(8));
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

        children.props.onChange?.({
          target: { value: mapUrl },
          currentTarget: { value: mapUrl },
        });

        window.dispatchEvent(new CustomEvent("landview-project-location", {
          detail: { latitude, longitude },
        }));

        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : 0;
        setLocationMessage(`Location tag updated${accuracy ? ` · accuracy ±${accuracy} m` : ""}. GPS coordinates will be stored internally when you save.`);
        setLocating(false);
      },
      error => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location access is blocked. Allow Location for LAND VIEW in your browser/site settings, then try again."
          : error.code === error.POSITION_UNAVAILABLE
            ? "Your current location could not be determined. Check GPS and try again."
            : "Location request timed out. Check GPS and try again.";
        setLocationMessage(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  if (isProjectCoordinate) {
    return <label className="form-field" style={{display:"none"}} aria-hidden="true">
      <span>{label}</span>
      {children}
    </label>;
  }

  const locationTagElement = isProjectLocationTag && isValidElement(children)
    ? children as ReactElement<any>
    : null;
  const renderedChildren = locationTagElement
    ? cloneElement(locationTagElement, {
        onBlur: (event: any) => {
          locationTagElement.props.onBlur?.(event);
          void normalizeLocationTag(String(event.currentTarget?.value || event.target?.value || ""));
        },
      })
    : children;

  return <label className="form-field">
    <span>{displayLabel}</span>
    {renderedChildren}
    {isProjectLocationTag && <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:7}}>
      <button type="button" className="btn btn-small" onClick={event=>{event.preventDefault();event.stopPropagation();useCurrentLocation();}} disabled={locating || normalizingTag}>
        {locating ? "Getting current location..." : normalizingTag ? "Resolving Location Tag..." : "Use Current Location"}
      </button>
      {locationMessage && <small style={{margin:0,flex:"1 1 180px"}}>{locationMessage}</small>}
    </div>}
    {isProjectLocationTag && !hint && <small>Paste a Google Maps link or use current location. Short Google Maps links are converted to an exact coordinate link automatically. Only projects with a Location Tag appear on the public map.</small>}
    {hint && <small>{hint}</small>}
  </label>;
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
