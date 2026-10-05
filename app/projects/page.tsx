import Link from "next/link";
import PublicProjectList from "@/components/public-project-list";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getPublicProjectsForSeo();
  const hasMappedProjects = projects.some((project) => project.mapEnabled === true);

  return <>
    <PublicProjectList initialProjects={projects} />
    {hasMappedProjects && <Link href="/projects/map" aria-label="Open interactive project map" style={{position:"fixed",right:18,bottom:18,zIndex:80,minHeight:44,display:"inline-flex",alignItems:"center",gap:8,padding:"0 15px",border:"1px solid rgba(239,74,80,.65)",borderRadius:999,background:"#101820",color:"#fff",fontSize:11,fontWeight:900,textDecoration:"none",boxShadow:"0 12px 30px rgba(0,0,0,.32)"}}><span aria-hidden="true">⌖</span> Map View</Link>}
  </>;
}
