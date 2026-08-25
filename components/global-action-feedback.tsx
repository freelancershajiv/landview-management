"use client";

import { useEffect } from "react";

type ButtonSnapshot = {
  html: string;
  disabled: boolean;
};

const actionPattern = /\b(save|create|add|update|submit|upload|assign|record|generate|approve|send|reset|delete|remove|mark)\b/i;

function loadingLabel(label: string) {
  const value = label.trim().toLowerCase();
  if (/delete|remove/.test(value)) return "Deleting…";
  if (/upload/.test(value)) return "Uploading…";
  if (/create|add/.test(value)) return "Creating…";
  if (/update/.test(value)) return "Updating…";
  if (/assign/.test(value)) return "Assigning…";
  if (/generate/.test(value)) return "Generating…";
  if (/send/.test(value)) return "Sending…";
  if (/approve/.test(value)) return "Approving…";
  if (/reset/.test(value)) return "Resetting…";
  if (/record|mark/.test(value)) return "Saving…";
  return "Saving…";
}

function isInternalAppPath() {
  const path = window.location.pathname;
  return path.startsWith("/admin") || path.startsWith("/employee") || path.startsWith("/client") || path.startsWith("/login");
}

function isSubmitButton(button: HTMLButtonElement) {
  const type = (button.getAttribute("type") || "submit").toLowerCase();
  return Boolean(button.form) && type === "submit";
}

export default function GlobalActionFeedback() {
  useEffect(() => {
    if (!isInternalAppPath()) return;

    const snapshots = new WeakMap<HTMLButtonElement, ButtonSnapshot>();
    const pending = new WeakMap<HTMLButtonElement, number>();
    let armedButton: HTMLButtonElement | null = null;
    let armedUntil = 0;
    let fallbackTimer: number | null = null;

    function restore(button: HTMLButtonElement) {
      const snapshot = snapshots.get(button);
      if (!snapshot) return;
      if (button.isConnected) {
        button.innerHTML = snapshot.html;
        button.disabled = snapshot.disabled;
        button.removeAttribute("aria-busy");
        button.classList.remove("lv-action-busy");
      }
      snapshots.delete(button);
      pending.delete(button);
      if (armedButton === button) armedButton = null;
    }

    function arm(button: HTMLButtonElement) {
      if (button.disabled || button.classList.contains("lv-action-busy")) return;
      const label = (button.textContent || "").trim();
      if (!actionPattern.test(label)) return;

      snapshots.set(button, { html: button.innerHTML, disabled: button.disabled });
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("lv-action-busy");
      button.innerHTML = `<span class="lv-action-spinner" aria-hidden="true"></span><span>${loadingLabel(label)}</span>`;
      armedButton = button;
      armedUntil = Date.now() + 1500;

      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(() => {
        if ((pending.get(button) || 0) === 0) restore(button);
      }, 5000);
    }

    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button) return;

      // Never disable a submit button during the click event. Doing so before
      // the browser's default action prevents the form submit event entirely.
      // Submit buttons are armed safely from onSubmit below.
      if (isSubmitButton(button)) return;

      // For ordinary action buttons, wait until their click handlers have run.
      // This prevents the global feedback layer from suppressing React onClick.
      window.setTimeout(() => {
        if (button.isConnected) arm(button);
      }, 0);
    }

    function onSubmit(event: SubmitEvent) {
      const submitter = event.submitter as HTMLButtonElement | null;
      if (submitter) {
        // The submit event already exists at this point, so disabling the
        // submitter now cannot cancel the form submission.
        arm(submitter);
        return;
      }

      const form = event.target as HTMLFormElement;
      const button = form.querySelector('button[type="submit"], button:not([type])') as HTMLButtonElement | null;
      if (button) arm(button);
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const button = armedButton && Date.now() <= armedUntil ? armedButton : null;
      if (button) {
        pending.set(button, (pending.get(button) || 0) + 1);
      }

      try {
        return await originalFetch(...args);
      } finally {
        if (button) {
          const next = Math.max(0, (pending.get(button) || 1) - 1);
          pending.set(button, next);
          if (next === 0) {
            window.setTimeout(() => restore(button), 120);
          }
        }
      }
    };

    // Capture submit so the loading state is ready before React's onSubmit
    // starts its fetch, but do not capture/disable ordinary clicks.
    document.addEventListener("click", onClick, false);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("click", onClick, false);
      document.removeEventListener("submit", onSubmit, true);
      window.fetch = originalFetch;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, []);

  return null;
}
