"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ProjectLocationSimplifier, {
  buildSimplifiedAddress,
  emptyProjectLocationDraft,
  hasStructuredLocation,
  structuredLocationPayload,
  type ProjectLocationDraft,
} from "@/components/project-location-simplifier";

type Mode = "new" | "legacy";
type ProjectLocationRow = ProjectLocationDraft & {
  projectId: string;
  legacyLocation?: string;
  locationTag?: string;
  siteLatitude?: string | number;
  siteLongitude?: string | number;
};

function text(value: unknown) { return String(value ?? "").trim(); }
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  return match?.[1] ? `LV-${String(Number(match[1])).padStart(3, "0")}` : "";
}
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!element) return;
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value); else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
function findInput(placeholderPart: string) {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((input) => input.placeholder.toLowerCase().includes(placeholderPart.toLowerCase())) || null;
}
function findLabelInput(labelPart: string) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find((item) => text(item.firstChild?.textContent || item.textContent).toLowerCase().includes(labelPart.toLowerCase()));
  return label?.querySelector<HTMLInputElement>("input") || null;
}

export default function ProjectRegistrationLocationBridge({ mode, children }: { mode: Mode; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState<ProjectLocationDraft>(emptyProjectLocationDraft);
  const [address, setAddress] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [notice, setNotice] = useState("");
  const locationRows = useRef<ProjectLocationRow[]>([]);
  const currentProjectId = useRef("");
  const lastSavedKey = useRef("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects/locations", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((json) => { if (!cancelled && json?.success && Array.isArray(json.data)) locationRows.current = json.data; })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    let timer = 0;
    const mount = () => {
      const form = document.querySelector(mode === "new" ? ".form-grid" : ".legacy-form");
      if (!form) return false;
      let target = document.getElementById(`project-location-simplifier-${mode}`);
      if (!target) {
        target = document.createElement("div");
        target.id = `project-location-simplifier-${mode}`;
        target.style.gridColumn = "1 / -1";
        const mapInput = mode === "new" ? findInput("Google Maps link") : findInput("Google Maps project location");
        const mapLabel = mapInput?.closest("label");
        if (mapLabel && mapLabel.parentElement === form) mapLabel.after(target); else form.prepend(target);
      }
      setHost(target);
      return true;
    };
    if (!mount()) {
      observer = new MutationObserver(() => { if (mount()) observer?.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = window.setTimeout(() => observer?.disconnect(), 8000);
    }
    return () => { observer?.disconnect(); if (timer) window.clearTimeout(timer); };
  }, [mode]);

  useEffect(() => {
    const sync = () => {
      const addressInput = mode === "new" ? findInput("Project/site address") : findInput("Address or Google Maps link");
      const tagInput = mode === "new" ? findInput("Google Maps link") : findInput("Google Maps project location");
      if (addressInput && document.activeElement !== addressInput) setAddress(addressInput.value);
      if (tagInput && document.activeElement !== tagInput) setLocationTag(tagInput.value);
      if (mode === "legacy") {
        const latInput = findLabelInput("Site Latitude");
        const lngInput = findLabelInput("Site Longitude");
        if (latInput && document.activeElement !== latInput) setLatitude(latInput.value);
        if (lngInput && document.activeElement !== lngInput) setLongitude(lngInput.value);
        const idInput = findInput("LV-069");
        const id = normalizeProjectId(idInput?.value);
        if (id && id !== currentProjectId.current) {
          currentProjectId.current = id;
          lastSavedKey.current = "";
          const row = locationRows.current.find((item) => normalizeProjectId(item.projectId) === id);
          if (row) {
            setDraft({
              division: text(row.division), district: text(row.district), upazilaThana: text(row.upazilaThana),
              localBodyType: text(row.localBodyType), localBodyName: text(row.localBodyName), wardNo: text(row.wardNo),
              villageArea: text(row.villageArea), roadHolding: text(row.roadHolding),
            });
            if (row.legacyLocation) setAddress(text(row.legacyLocation));
            if (row.locationTag) setLocationTag(text(row.locationTag));
            if (row.siteLatitude !== undefined) setLatitude(text(row.siteLatitude));
            if (row.siteLongitude !== undefined) setLongitude(text(row.siteLongitude));
          } else {
            setDraft(emptyProjectLocationDraft);
          }
        }
      }
    };
    sync();
    const timer = window.setInterval(sync, 500);
    return () => window.clearInterval(timer);
  }, [mode]);

  function changeAddress(next: string) {
    setAddress(next);
    const input = mode === "new" ? findInput("Project/site address") : findInput("Address or Google Maps link");
    setNativeValue(input, next);
  }
  function changeTag(next: string) {
    setLocationTag(next);
    const input = mode === "new" ? findInput("Google Maps link") : findInput("Google Maps project location");
    setNativeValue(input, next);
  }
  function changeCoordinates(lat: string, lng: string) {
    setLatitude(lat); setLongitude(lng);
    if (mode === "legacy") {
      setNativeValue(findLabelInput("Site Latitude"), lat);
      setNativeValue(findLabelInput("Site Longitude"), lng);
    }
  }

  useEffect(() => {
    let saving = false;
    const saveStructured = async (projectId: string) => {
      if (saving || !projectId || !hasStructuredLocation(draft)) return;
      const simplified = buildSimplifiedAddress(draft);
      const key = JSON.stringify([projectId, draft, simplified || address, locationTag, latitude, longitude]);
      if (lastSavedKey.current === key) return;
      saving = true;
      try {
        const response = await fetch("/api/projects/locations", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
          body: JSON.stringify(structuredLocationPayload(projectId, draft, simplified || address, locationTag, latitude, longitude)),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save structured location."));
        lastSavedKey.current = key;
        setNotice(`Structured location saved with ${projectId}.`);
        if (simplified) changeAddress(simplified);
        if (mode === "new") {
          window.setTimeout(() => { setDraft(emptyProjectLocationDraft); setAddress(""); setLocationTag(""); setLatitude(""); setLongitude(""); setNotice(""); }, 1400);
        }
      } catch (error: any) {
        setNotice(error?.message || "Project saved, but structured location could not be saved.");
      } finally { saving = false; }
    };

    const inspect = () => {
      const success = document.querySelector(mode === "new" ? ".message.ok" : ".legacy-message.ok");
      const id = normalizeProjectId(success?.textContent || "");
      if (id) void saveStructured(id);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    inspect();
    return () => observer.disconnect();
  }, [mode, draft, address, locationTag, latitude, longitude]);

  return <>
    {children}
    {host && createPortal(<>
      <ProjectLocationSimplifier
        value={draft}
        onChange={setDraft}
        address={address}
        onAddressChange={changeAddress}
        locationTag={locationTag}
        onLocationTagChange={changeTag}
        siteLatitude={latitude}
        siteLongitude={longitude}
        onCoordinatesChange={changeCoordinates}
        title="Location Simplifier"
        initiallyOpen={true}
      />
      {notice && <div style={{ marginTop: 7, fontSize: 10, fontWeight: 800, color: notice.toLowerCase().includes("could not") ? "#ff9d96" : "#8cd7aa" }}>{notice}</div>}
    </>, host)}
  </>;
}
