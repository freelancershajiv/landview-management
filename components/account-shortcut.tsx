import Link from "next/link";

export default function AccountShortcut({ label = "My Account", mobileDock = false }: { label?: string; mobileDock?: boolean }) {
  return <>
    <style>{`
      .lv-account-shortcut{
        position:fixed;
        left:14px;
        bottom:${mobileDock ? "86px" : "82px"};
        z-index:360;
        width:${mobileDock ? "220px" : "210px"};
        padding:12px;
        border:1px solid rgba(214,31,38,.45);
        border-radius:13px;
        background:linear-gradient(145deg,rgba(214,31,38,.16),rgba(15,19,24,.97) 62%);
        color:#fff;
        text-decoration:none;
        box-shadow:0 18px 42px rgba(0,0,0,.32);
        backdrop-filter:blur(12px);
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
      }
      .lv-account-shortcut:hover{
        transform:translateY(-2px);
        border-color:rgba(255,93,99,.78);
        box-shadow:0 22px 52px rgba(0,0,0,.38),0 0 0 1px rgba(214,31,38,.08) inset;
      }
      .lv-account-shortcut-head{display:flex;align-items:center;gap:10px}
      .lv-account-shortcut-icon{
        width:38px;height:38px;flex:0 0 38px;border-radius:10px;display:grid;place-items:center;
        background:linear-gradient(135deg,#d61f26,#94141a);border:1px solid rgba(255,255,255,.12);
        color:#fff;font-size:17px;font-weight:950;
      }
      .lv-account-shortcut-copy{display:grid;gap:2px;min-width:0}
      .lv-account-shortcut-copy strong{font-size:11px;line-height:1.2;font-weight:950;letter-spacing:.02em}
      .lv-account-shortcut-copy small{font-size:7.5px;line-height:1.3;color:#939da7;text-transform:uppercase;letter-spacing:.11em}
      .lv-account-shortcut-meta{margin-top:10px;font-size:8.5px;line-height:1.5;color:#aab3bb}
      .lv-account-shortcut-action{
        margin-top:10px;min-height:32px;padding:0 10px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;
        background:#d61f26;color:#fff;font-size:8.5px;font-weight:950;letter-spacing:.055em;text-transform:uppercase;
      }
      .lv-account-shortcut-action span:last-child{font-size:15px;line-height:1}
      @media(max-width:900px){
        .lv-account-shortcut{
          left:auto;right:12px;bottom:${mobileDock ? "78px" : "14px"};width:190px;padding:10px;border-radius:12px;
        }
        .lv-account-shortcut-meta{display:none}
        .lv-account-shortcut-action{margin-top:8px}
      }
      @media(max-width:520px){
        .lv-account-shortcut{width:174px}
        .lv-account-shortcut-copy small{display:none}
        .lv-account-shortcut-icon{width:34px;height:34px;flex-basis:34px}
      }
    `}</style>
    <Link className="lv-account-shortcut" href="/account" aria-label="Open Account and Security">
      <div className="lv-account-shortcut-head">
        <span className="lv-account-shortcut-icon" aria-hidden="true">⚿</span>
        <span className="lv-account-shortcut-copy">
          <strong>Account &amp; Security</strong>
          <small>{label}</small>
        </span>
      </div>
      <div className="lv-account-shortcut-meta">Profile photo · Personal details · Password · Signed-in devices</div>
      <div className="lv-account-shortcut-action"><span>Manage my account</span><span>›</span></div>
    </Link>
  </>;
}
