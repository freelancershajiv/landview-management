import Link from "next/link";

export default function AccountShortcut({ label = "My Account", mobileDock = false }: { label?: string; mobileDock?: boolean }) {
  return <>
    <style>{`
      .lv-account-shortcut{position:fixed;right:18px;bottom:${mobileDock ? "82px" : "18px"};z-index:360;display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 14px;border:1px solid rgba(214,31,38,.38);border-radius:999px;background:rgba(17,26,34,.96);color:#fff;text-decoration:none;font-size:11px;font-weight:900;box-shadow:0 10px 28px rgba(0,0,0,.22);backdrop-filter:blur(12px)}
      .lv-account-shortcut:hover{border-color:#d61f26;background:#d61f26}.lv-account-shortcut span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1);font-size:12px}
      @media(max-width:900px){.lv-account-shortcut{right:12px;bottom:${mobileDock ? "78px" : "14px"};min-height:40px;padding:0 12px}}
    `}</style>
    <Link className="lv-account-shortcut" href="/account"><span aria-hidden="true">●</span>{label}</Link>
  </>;
}
