"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "landview-theme";
const CHANGE_EVENT = "landview-theme-change";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: string | null) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) applyTheme(event.newValue);
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export default function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");
  const dark = theme === "dark";
  function toggle() {
    const next = dark ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Works for this visit if storage is unavailable. */ }
  }
  return <button type="button" className="lv-theme-switch" onClick={toggle}
    aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Switch to ${dark ? "light" : "dark"} mode`}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {dark ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20.5 13.5A8.7 8.7 0 0 1 10.5 3a9 9 0 1 0 10 10.5Z"/>}
    </svg>
    <span>{dark ? "Light mode" : "Dark mode"}</span>
  </button>;
}
