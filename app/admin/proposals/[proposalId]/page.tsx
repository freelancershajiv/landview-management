"use client";

import { useParams } from "next/navigation";
import LinkedWorkPanel from "@/components/linked-work-panel";
import ProposalWorkspace from "@/components/proposal-workspace";
import ProposalStatusControls from "@/components/proposal-status-controls";

export default function ProposalDetailPage(){
  const params=useParams<{proposalId:string}>();
  const id=String(params?.proposalId||"");
  return <>
    {id && <LinkedWorkPanel type="proposal" code={id}/>}
    <ProposalWorkspace proposalId={id}/>
    {id&&<ProposalStatusControls proposalId={id}/>} 
  </>;
}
