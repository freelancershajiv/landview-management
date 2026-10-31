export type ProposalItem = {
  Item_ID?: string;
  Proposal_ID?: string;
  Service: string;
  Description?: string;
  Quantity: number;
  Unit: string;
  Rate: number;
  Amount: number;
  Discount?: number;
  Net_Amount?: number;
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

export type ProposalConversionPreview = {
  proposalId: string;
  status: string;
  alreadyConvertedProjectId: string;
  nextProjectId: string;
  netAmount: number;
  discount: number;
  designDeliverables: string[];
  approvalRequirements: string[];
  workflowTasks: string[];
  supervisionRequired: boolean;
};

export type ProposalConversionResult = {
  projectId: string;
  proposalId?: string;
  alreadyConverted?: boolean;
  lifecyclePhase?: string;
  designDeliverables?: number;
  approvalRequirements?: number;
  workflowTasks?: number;
  billingLines?: number;
  billedNet?: number;
  supervisionRequired?: boolean;
};

type ProposalItemDiscount = {
  Item_ID: string;
  Discount: number;
  Net_Amount: number;
};

async function parse(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Proposal request failed."));
  return json.data;
}

function normalizeItemAmounts(item: ProposalItem): ProposalItem {
  const quantity = Math.max(0, Number(item.Quantity) || 0);
  const rate = Math.max(0, Number(item.Rate) || 0);
  const amount = Math.max(0, Number(item.Amount) || quantity * rate);
  const discount = Math.min(amount, Math.max(0, Number(item.Discount) || 0));
  return { ...item, Quantity: quantity, Rate: rate, Amount: amount, Discount: discount, Net_Amount: Math.max(0, amount - discount) };
}

function mergeDiscounts(bundle: ProposalBundle, discounts: ProposalItemDiscount[]): ProposalBundle {
  const byId = new Map(discounts.map((row) => [String(row.Item_ID || ""), row]));
  return {
    ...bundle,
    items: (bundle.items || []).map((item) => {
      const row = item.Item_ID ? byId.get(String(item.Item_ID)) : undefined;
      return normalizeItemAmounts({
        ...item,
        Discount: row?.Discount ?? item.Discount ?? 0,
        Net_Amount: row?.Net_Amount ?? item.Net_Amount,
      });
    }),
  };
}

async function loadItemDiscounts(proposalId: string): Promise<ProposalItemDiscount[]> {
  const url = new URL("/api/proposal-item-discounts", window.location.origin);
  url.searchParams.set("proposalId", proposalId);
  return (await parse(await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" }))) || [];
}

async function saveItemDiscounts(proposalId: string, items: ProposalItem[]): Promise<ProposalItemDiscount[]> {
  return (await parse(await fetch("/api/proposal-item-discounts", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposalId, items: items.map((item) => ({ Item_ID: item.Item_ID, Discount: Number(item.Discount) || 0, Net_Amount: Number(item.Net_Amount) || 0 })) }),
  }))) || [];
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
  const bundle = await parse(await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" })) as ProposalBundle;
  return mergeDiscounts(bundle, await loadItemDiscounts(id));
}

export async function saveProposal(record: ProposalRecord, items: ProposalItem[]): Promise<ProposalBundle> {
  const normalizedItems = items.map(normalizeItemAmounts);
  const action = record.Proposal_ID ? "updateErpRecord" : "createErpRecord";
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, module: "proposalsV2", id: record.Proposal_ID || "", op: "save", record: { ...record, items: normalizedItems }, items: normalizedItems }),
  });
  const bundle = await parse(response) as ProposalBundle;
  const proposalId = String(bundle.proposal?.Proposal_ID || record.Proposal_ID || "");
  if (!proposalId) return bundle;

  const submittedById = new Map(normalizedItems.filter((item) => item.Item_ID).map((item) => [String(item.Item_ID), item]));
  const persisted = (bundle.items || []).map((item, index) => {
    const source = (item.Item_ID ? submittedById.get(String(item.Item_ID)) : undefined) || normalizedItems[index] || item;
    return normalizeItemAmounts({ ...item, Discount: source.Discount ?? 0, Net_Amount: source.Net_Amount });
  });
  const discounts = await saveItemDiscounts(proposalId, persisted);
  return mergeDiscounts({ ...bundle, items: persisted }, discounts);
}

export async function updateProposalAction(id: string, op: "print" | "status" | "convert", data: Record<string, unknown> = {}): Promise<ProposalBundle> {
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "updateErpRecord", module: "proposalsV2", id, op, ...data }),
  });
  const bundle = await parse(response) as ProposalBundle;
  return mergeDiscounts(bundle, await loadItemDiscounts(id));
}

export async function getProposalConversionPreview(id: string): Promise<ProposalConversionPreview> {
  const url = new URL("/api/proposal-conversion", window.location.origin);
  url.searchParams.set("proposalId", id);
  return parse(await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" }));
}

export async function convertAcceptedProposal(id: string): Promise<ProposalConversionResult> {
  return parse(await fetch("/api/proposal-conversion", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposalId: id }),
  }));
}
