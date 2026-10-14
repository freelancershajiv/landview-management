import ProjectLifecycleAutoAdvance from "@/components/project-lifecycle-auto-advance";
import ProjectTaskCenter from "@/components/project-task-center";
import ProjectLifecycleWorkspace from "@/components/project-lifecycle-workspace";

export default function ProjectLifecyclePage() {
  return <>
    <ProjectLifecycleAutoAdvance />
    <ProjectTaskCenter />
    <ProjectLifecycleWorkspace />
  </>;
}
