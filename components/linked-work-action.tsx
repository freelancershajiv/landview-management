import Link from "next/link";
import { workScope, workTaskHref } from "@/lib/work-task-links";

export default function LinkedWorkAction({ projectCode, title, source, label = "Create task" }: { projectCode: unknown; title: string; source?: string; label?: string }) {
  const scope = workScope("project", projectCode);
  if (!scope) return null;
  return <span style={{display:"inline-flex",gap:8,flexWrap:"wrap",alignItems:"center",margin:"4px 0"}}>
    <Link href={workTaskHref(scope)} target="_blank" rel="noopener noreferrer" style={{color:"var(--lv-brand-text)",fontSize:12,textDecoration:"underline"}}>Tasks</Link>
    <Link href={workTaskHref(scope,title,source)} target="_blank" rel="noopener noreferrer" style={{color:"var(--lv-brand-text)",fontWeight:700,fontSize:12,textDecoration:"underline"}}>{label}</Link>
  </span>;
}
