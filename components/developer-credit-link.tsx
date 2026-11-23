import Link from "next/link";
import { DEVELOPER_NAME, DEVELOPER_PROFILE_PATH, DEVELOPER_PROFILE_PRINT_URL } from "@/lib/developer-credit";

/** Web attribution stays clickable; a visible URL survives image-based PDF exports. */
export default function DeveloperCreditLink({ showPrintUrl = false }: { showPrintUrl?: boolean }) {
  return <>
    Developed by <Link className="lv-developer-attribution-link" href={DEVELOPER_PROFILE_PATH}>{DEVELOPER_NAME}</Link>
    {showPrintUrl && <small className="lv-developer-attribution-url" style={{ display: "block", fontSize: "7px", lineHeight: 1.2, fontWeight: 400 }}>{DEVELOPER_PROFILE_PRINT_URL}</small>}
  </>;
}
