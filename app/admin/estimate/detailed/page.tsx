import Link from "next/link";
import DetailedEstimateWorkspace from "@/components/detailed-estimate-workspace";

export default function DetailedEstimatePage() {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
        <Link href="/admin/estimate" style={{fontSize:11,fontWeight:900,textDecoration:"none",color:"inherit"}}>← Estimate Types</Link>
        <Link href="/admin/estimate/summary" style={{fontSize:11,fontWeight:900,textDecoration:"none",color:"#d61f26"}}>Open Summary Estimate →</Link>
      </div>
      <DetailedEstimateWorkspace />
    </div>
  );
}
