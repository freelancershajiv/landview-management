"use client";

import { useParams } from "next/navigation";
import ProposalWorkspace from "@/components/proposal-workspace";
import ProposalStatusControls from "@/components/proposal-status-controls";

export default function ProposalDetailPage(){
  const params=useParams<{proposalId:string}>();
  const id=String(params?.proposalId||"");
  return <><ProposalWorkspace proposalId={id}/>{id&&<ProposalStatusControls proposalId={id}/>}</>;
}
