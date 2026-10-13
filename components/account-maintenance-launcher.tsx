import Link from "next/link";

type Props = {
  role: "manager" | "employee";
  name?: string;
  employeeId?: string;
};

export default function AccountMaintenanceLauncher({ role, name = "LAND VIEW User", employeeId = "" }: Props) {
  const initials = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "LV";

  return <>
    <style>{`
      .self-account-launcher{
        position:fixed;
        z-index:360;
        left:${role === "employee" ? "12px" : "16px"};
        bottom:84px;
        width:${role === "employee" ? "214px" : "220px"};
        padding:12px;
        border:1px solid rgba(214,31,38,.38);
        border-radius:13px;
        background:linear-gradient(145deg,rgba(214,31,38,.13),rgba(18,22,27,.97) 58%);
        box-shadow:0 18px 45px rgba(0,0,0,.28);
        color:#f5f7fa;
        text-decoration:none;
        backdrop-filter:blur(12px);
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
      }
      .self-account-launcher:hover{
        transform:translateY(-2px);
        border-color:rgba(255,85,91,.72);
        box-shadow:0 20px 48px rgba(0,0,0,.36),0 0 0 1px rgba(214,31,38,.08) inset;
      }
      .self-account-launcher-top{display:flex;align-items:center;gap:10px}
      .self-account-launcher-avatar{
        width:38px;height:38px;flex:0 0 38px;border-radius:10px;display:grid;place-items:center;
        background:linear-gradient(135deg,#d61f26,#8d1118);color:#fff;font-size:12px;font-weight:950;
        border:1px solid rgba(255,255,255,.12)
      }
      .self-account-launcher-copy{min-width:0;display:grid;gap:2px}
      .self-account-launcher-copy strong{font-size:11px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .self-account-launcher-copy small{font-size:8px;color:#9ba5ae;text-transform:uppercase;letter-spacing:.08em}
      .self-account-launcher-title{margin-top:11px;font-size:12px;font-weight:950;color:#fff}
      .self-account-launcher-sub{margin-top:4px;font-size:8.5px;line-height:1.45;color:#9aa4ad}
      .self-account-launcher-action{
        margin-top:10px;min-height:32px;padding:0 10px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;
        background:#d61f26;color:#fff;font-size:9px;font-weight:950;letter-spacing:.04em;text-transform:uppercase
      }
      .self-account-launcher-action span:last-child{font-size:14px;line-height:1}
      @media(max-width:900px){
        .self-account-launcher{left:auto;right:14px;bottom:16px;width:190px;padding:10px;border-radius:12px}
        .self-account-launcher-title,.self-account-launcher-sub{display:none}
        .self-account-launcher-action{margin-top:8px}
      }
      @media(max-width:520px){
        .self-account-launcher{width:auto;max-width:calc(100vw - 28px);min-width:168px}
        .self-account-launcher-copy small{display:none}
      }
    `}</style>
    <Link href="/account" className="self-account-launcher" aria-label="Open Account and Security">
      <div className="self-account-launcher-top">
        <div className="self-account-launcher-avatar">{initials}</div>
        <div className="self-account-launcher-copy">
          <strong>{name}</strong>
          <small>{role === "manager" ? "Manager Account" : employeeId || "Employee Account"}</small>
        </div>
      </div>
      <div className="self-account-launcher-title">Account &amp; Security</div>
      <div className="self-account-launcher-sub">Profile photo, personal details, password and signed-in devices.</div>
      <div className="self-account-launcher-action"><span>Manage my account</span><span>›</span></div>
    </Link>
  </>;
}
