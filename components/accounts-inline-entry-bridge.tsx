"use client";

import { useEffect, useState } from "react";
import AccountsEntryPanel, { type AccountsEntryType } from "@/components/accounts-entry-panel";

export default function AccountsInlineEntryBridge() {
  const [entryType, setEntryType] = useState<AccountsEntryType | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest<HTMLAnchorElement>('a[href^="/admin/accounts/entry"]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      const url = new URL(link.href, window.location.origin);
      setSavedMessage("");
      setEntryType(url.searchParams.get("type") === "expense" ? "expense" : "income");
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!entryType) return null;

  return (
    <div
      className="accounts-inline-entry-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setEntryType(null);
      }}
    >
      <style>{`
        .accounts-inline-entry-backdrop{position:fixed;inset:0;z-index:1500;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.74);overflow:auto}
        .accounts-inline-entry-dialog{width:min(1080px,100%);max-height:94vh;overflow:auto}
        .accounts-inline-entry-dialog .accounts-entry-panel{margin:0;box-shadow:0 30px 90px rgba(0,0,0,.45)}
        .accounts-inline-save-message{margin:0 0 9px;padding:9px 12px;border:1px solid var(--theme-line-_2e6345,#2e6345);border-radius:8px;background:var(--theme-bg-_183524,#183524);color:var(--theme-ink-_a2e6b8,#a2e6b8);font-size:9px;font-weight:800}
      `}</style>
      <div className="accounts-inline-entry-dialog">
        {savedMessage && <div className="accounts-inline-save-message">{savedMessage}</div>}
        <AccountsEntryPanel
          type={entryType}
          onTypeChange={setEntryType}
          onClose={() => setEntryType(null)}
          onSaved={(message) => {
            setSavedMessage(message);
            window.setTimeout(() => window.location.reload(), 650);
          }}
        />
      </div>
    </div>
  );
}
