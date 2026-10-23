import Link from "next/link";
import PublicProjectListPaginated from "@/components/public-project-list-paginated";
import { getPublicProjectPage } from "@/lib/public-project-pagination";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const page = await getPublicProjectPage({ offset: 0, limit: 12 });

  return <>
    <PublicProjectListPaginated
      initialProjects={page.data}
      initialTotal={page.total}
      initialPublishedTotal={page.publishedTotal}
      initialCategories={page.categories}
    />
    {page.hasMappedProjects && <Link className="lv-project-map-fab" href="/projects/map" aria-label="Open interactive project map" style={{position:"fixed",right:18,bottom:18,zIndex:80,minHeight:44,display:"inline-flex",alignItems:"center",gap:8,padding:"0 15px",border:"1px solid var(--lv-brand-border)",borderRadius:999,background:"var(--lv-surface-chrome)",color:"var(--lv-text-on-chrome)",fontSize:11,fontWeight:900,textDecoration:"none",boxShadow:"0 12px 30px rgba(0,0,0,.32)"}}><span aria-hidden="true">⌖</span> Map View</Link>}
  </>;
}