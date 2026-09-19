export type ProposalItem = {
  Item_ID?: string;
  Proposal_ID?: string;
  Service: string;
  Description?: string;
  Quantity: number;
  Unit: string;
  Rate: number;
  Amount: number;
  Sort_Order?: number;
  Category?: string;
  Notes?: string;
};

export type ProposalRecord = {
  Proposal_ID?: string;
  Prospect_ID?: string;
  Client_Name: string;
  Phone: string;
  Email?: string;
  Address?: string;
  Source?: string;
  Referred_By?: string;
  Ref_Contact?: string;
  Project_Title?: string;
  Project_Location?: string;
  Project_Type?: string;
  Plot_Area?: string;
  Floors?: string;
  Gross_Amount?: number;
  Discount?: number;
  Net_Amount?: number;
  Validity_Days?: number;
  Valid_Until?: string;
  Status?: string;
  Assigned_To?: string;
  Created_At?: string;
  Created_By?: string;
  Updated_At?: string;
  Notes?: string;
  Converted_Project_ID?: string;
  Last_Printed_At?: string;
  items?: ProposalItem[];
};

export type ProposalBundle = {
  proposal: ProposalRecord;
  prospect?: Record<string, unknown> | null;
  items: ProposalItem[];
  activity?: Record<string, unknown>[];
};

async function parse(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Proposal request failed."));
  return json.data;
}

export async function getProposalPermissions() {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getErpRecords");
  url.searchParams.set("module", "workspacePermissionsV2");
  return parse(await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" }));
}

export async function listProposals(): Promise<ProposalRecord[]> {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getErpRecords");
  url.searchParams.set("module", "proposalsV2");
  url.searchParams.set("op", "list");
  return (await parse(await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" }))) || [];
}

export async function getProposal(id: string): Promise<ProposalBundle> {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getErpRecords");
  url.searchParams.set("module", "proposalsV2");
  url.searchParams.set("op", "get");
  url.searchParams.set("id", id);
  return parse(await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" }));
}

export async function saveProposal(record: ProposalRecord, items: ProposalItem[]): Promise<ProposalBundle> {
  const action = record.Proposal_ID ? "updateErpRecord" : "createErpRecord";
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, module: "proposalsV2", id: record.Proposal_ID || "", op: "save", record: { ...record, items }, items }),
  });
  return parse(response);
}

export async function updateProposalAction(id: string, op: "print" | "status" | "convert", data: Record<string, unknown> = {}): Promise<ProposalBundle> {
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "updateErpRecord", module: "proposalsV2", id, op, ...data }),
  });
  return parse(response);
}
