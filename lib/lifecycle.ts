export const PROPOSAL_LIFECYCLE_PHASES = [
  "Site Entry Pending Approval",
  "Site Entry Rejected",
  "Proposal Draft",
  "Proposal Sent",
  "Proposal Accepted",
  "Proposal Expired",
  "Project Registered",
] as const;

export const PROJECT_LIFECYCLE_PHASES = [
  "Design Stage",
  "Approval Stage",
  "Supervision / Construction Stage",
  "Completed",
] as const;

export type ProposalLifecyclePhase = typeof PROPOSAL_LIFECYCLE_PHASES[number];
export type ProjectLifecyclePhase = typeof PROJECT_LIFECYCLE_PHASES[number];

export function isProjectLifecyclePhase(value: unknown): value is ProjectLifecyclePhase {
  return PROJECT_LIFECYCLE_PHASES.includes(String(value || "") as ProjectLifecyclePhase);
}

export function projectStageUpdates(phase: ProjectLifecyclePhase) {
  if (phase === "Design Stage") {
    return {
      design_stage_status: "In Progress",
      approval_stage_status: "Pending",
      supervision_stage_status: "Completed",
    };
  }
  if (phase === "Approval Stage") {
    return {
      design_stage_status: "Completed",
      approval_stage_status: "In Progress",
      supervision_stage_status: "Completed",
    };
  }
  if (phase === "Supervision / Construction Stage") {
    return {
      design_stage_status: "Completed",
      approval_stage_status: "Completed",
      supervision_stage_status: "In Progress",
    };
  }
  return {
    design_stage_status: "Completed",
    approval_stage_status: "Completed",
    supervision_stage_status: "Completed",
  };
}

export function nextProjectLifecyclePhase(phase: unknown): ProjectLifecyclePhase {
  const current = String(phase || "Design Stage") as ProjectLifecyclePhase;
  const index = PROJECT_LIFECYCLE_PHASES.indexOf(current);
  if (index < 0) return "Design Stage";
  return PROJECT_LIFECYCLE_PHASES[Math.min(index + 1, PROJECT_LIFECYCLE_PHASES.length - 1)];
}

export function lifecycleRank(phase: unknown) {
  const value = String(phase || "");
  const proposalIndex = PROPOSAL_LIFECYCLE_PHASES.indexOf(value as ProposalLifecyclePhase);
  if (proposalIndex >= 0) return proposalIndex;
  const projectIndex = PROJECT_LIFECYCLE_PHASES.indexOf(value as ProjectLifecyclePhase);
  return 7 + Math.max(0, projectIndex);
}
