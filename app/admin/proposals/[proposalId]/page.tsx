"use client";

import { useParams } from "next/navigation";
import ProposalWorkspace from "@/components/proposal-workspace";
import ProposalStatusControls from "@/components/proposal-status-controls";
import ProposalFinanceBillingDocument from "@/components/proposal-finance-billing-document";

export default function ProposalDetailPage(){
  const params=useParams<{proposalId:string}>();
  const id=String(params?.proposalId||"");
  return <>
    <ProposalWorkspace proposalId={id}/>
    {id&&<ProposalFinanceBillingDocument proposalId={id}/>} 
    {id&&<ProposalStatusControls proposalId={id}/>} 
  </>;
}
