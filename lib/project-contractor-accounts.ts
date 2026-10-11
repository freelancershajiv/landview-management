import { selectRows } from "@/lib/supabase-data";

type Row = Record<string, any>;

export const contractorNum = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
export const contractorClean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
export const contractorPartyKey = (value: unknown) => contractorClean(value, 180)
  .toLowerCase()
  .replace(/\b(contactor|contractor)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function isCertified(row: Row) {
  return contractorClean(row.status, 30).toLowerCase() === "certified";
}

function configuredValue(contract: Row) {
  const pricingType = contractorClean(contract.pricing_type, 20).toLowerCase() === "lump_sum" ? "lump_sum" : "rate";
  return pricingType === "lump_sum"
    ? Math.max(0, contractorNum(contract.contract_amount))
    : Math.max(0, contractorNum(contract.contract_quantity) * contractorNum(contract.agreed_rate));
}

function percent(numerator: number, denominator: number) {
  if (!(denominator > 0)) return null;
  return Math.max(0, (numerator / denominator) * 100);
}

export async function contractorWorkspaceForProject(projectId: string, projectCode = "") {
  const [allContracts, bills, progressRows, ledgerRows] = await Promise.all([
    selectRows("project_contractor_contracts", { filters: { project_id: projectId }, order: "contractor_name:asc", limit: 2000 }),
    selectRows("project_contractor_bills", { filters: { project_id: projectId }, order: "bill_date:asc", limit: 10000 }),
    selectRows("project_contractor_progress_updates", { filters: { project_id: projectId }, order: "progress_date:asc", limit: 10000 }),
    selectRows("project_management_ledger", { filters: { project_id: projectId }, order: "entry_date:asc", limit: 30000 }),
  ]);

  const contracts = allContracts.filter((row: Row) => contractorClean(row.party_type || "Contractor", 30).toLowerCase() === "contractor");
  const activeContracts = contracts.filter((row: Row) => Boolean(row.active));
  const nameCounts = new Map<string, number>();
  for (const contract of activeContracts) {
    const key = contractorPartyKey(contract.contractor_name);
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const accounts = activeContracts.map((contract: Row) => {
    const id = String(contract.id || "");
    const partyKey = contractorPartyKey(contract.contractor_name);
    const contractBills = bills.filter((row: Row) => String(row.contract_id || "") === id);
    const certifiedBills = contractBills.filter(isCertified);
    const explicitPayments = ledgerRows.filter((row: Row) => String(row.contractor_contract_id || "") === id && contractorNum(row.credit) > 0);
    const fallbackPayments = ledgerRows.filter((row: Row) => !row.contractor_contract_id
      && contractorNum(row.credit) > 0
      && (nameCounts.get(partyKey) || 0) === 1
      && contractorPartyKey(row.paid_to || row.supplier) === partyKey);
    const payments = [...explicitPayments, ...fallbackPayments]
      .filter((row: Row, index: number, array: Row[]) => array.findIndex((candidate: Row) => String(candidate.id) === String(row.id)) === index)
      .sort((a: Row, b: Row) => {
        const d = String(a.entry_date || "").localeCompare(String(b.entry_date || ""));
        if (d) return d;
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
    const progress = progressRows
      .filter((row: Row) => String(row.contract_id || "") === id)
      .sort((a: Row, b: Row) => {
        const d = String(b.progress_date || "").localeCompare(String(a.progress_date || ""));
        if (d) return d;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });

    const contractValue = configuredValue(contract);
    const certifiedAmount = certifiedBills.reduce((sum: number, row: Row) => sum + contractorNum(row.net_amount ?? row.gross_amount), 0);
    const certifiedQuantity = certifiedBills.reduce((sum: number, row: Row) => sum + contractorNum(row.quantity), 0);
    const paidAmount = payments.reduce((sum: number, row: Row) => sum + contractorNum(row.credit), 0);
    const latestProgress = progress[0] || null;
    const physicalProgress = latestProgress ? contractorNum(latestProgress.progress_percent) : null;
    const certifiedProgress = percent(certifiedAmount, contractValue);
    const paymentProgress = percent(paidAmount, contractValue);
    const quantityProgress = contractorNum(contract.contract_quantity) > 0
      ? percent(certifiedQuantity, contractorNum(contract.contract_quantity))
      : null;
    const advance = Math.max(0, paidAmount - certifiedAmount);
    const payable = Math.max(0, certifiedAmount - paidAmount);
    const remainingContract = contractValue > 0 ? Math.max(0, contractValue - certifiedAmount) : 0;
    const overCertified = contractValue > 0 ? Math.max(0, certifiedAmount - contractValue) : 0;

    let runningPaid = 0;
    const paymentLedger = payments.map((row: Row) => {
      runningPaid += contractorNum(row.credit);
      return {
        id: row.id,
        serialNo: contractorNum(row.serial_no),
        date: row.entry_date,
        details: row.details || "",
        category: row.category || "",
        amount: contractorNum(row.credit),
        runningPaid,
        memo: row.memo || "",
        source: row.source || "",
        createdBy: row.created_by || "",
      };
    }).reverse();

    return {
      id: contract.id,
      contractorName: contract.contractor_name,
      category: contract.category,
      billingUnit: contract.billing_unit || "Unit",
      pricingType: contractorClean(contract.pricing_type, 20).toLowerCase() === "lump_sum" ? "lump_sum" : "rate",
      contractQuantity: contractorNum(contract.contract_quantity),
      agreedRate: contractorNum(contract.agreed_rate),
      contractAmount: contractorNum(contract.contract_amount),
      contractValue,
      contractConfigured: contractValue > 0,
      scopeDescription: contract.scope_description || "",
      startDate: contract.start_date || "",
      targetCompletionDate: contract.target_completion_date || "",
      notes: contract.notes || "",
      active: Boolean(contract.active),
      certifiedAmount,
      certifiedQuantity,
      paidAmount,
      advance,
      payable,
      remainingContract,
      overCertified,
      certifiedProgress,
      paymentProgress,
      quantityProgress,
      physicalProgress,
      progressVariance: physicalProgress !== null && certifiedProgress !== null ? physicalProgress - certifiedProgress : null,
      latestProgress: latestProgress ? {
        id: latestProgress.id,
        date: latestProgress.progress_date,
        percent: contractorNum(latestProgress.progress_percent),
        completedQuantity: contractorNum(latestProgress.completed_quantity),
        stageName: latestProgress.stage_name || "",
        floorLabel: latestProgress.floor_label || "",
        description: latestProgress.description || "",
        notes: latestProgress.notes || "",
        createdBy: latestProgress.created_by || "",
      } : null,
      progressHistory: progress.map((row: Row) => ({
        id: row.id,
        date: row.progress_date,
        percent: contractorNum(row.progress_percent),
        completedQuantity: contractorNum(row.completed_quantity),
        stageName: row.stage_name || "",
        floorLabel: row.floor_label || "",
        description: row.description || "",
        notes: row.notes || "",
        createdBy: row.created_by || "",
      })),
      bills: contractBills.slice().sort((a: Row, b: Row) => String(b.bill_date || "").localeCompare(String(a.bill_date || ""))).map((row: Row) => ({
        id: row.id,
        billCode: row.bill_code,
        date: row.bill_date,
        description: row.description,
        quantity: contractorNum(row.quantity),
        rate: contractorNum(row.rate),
        grossAmount: contractorNum(row.gross_amount),
        deduction: contractorNum(row.deduction),
        netAmount: contractorNum(row.net_amount),
        status: row.status || "Certified",
        notes: row.notes || "",
        createdBy: row.created_by || "",
      })),
      paymentCount: payments.length,
      paymentLedger,
    };
  });

  const configured = accounts.filter((account: Row) => contractorNum(account.contractValue) > 0);
  const reportedPhysical = accounts.filter((account: Row) => account.physicalProgress !== null);
  const configuredReported = reportedPhysical.filter((account: Row) => contractorNum(account.contractValue) > 0);
  const configuredValueTotal = configured.reduce((sum: number, account: Row) => sum + contractorNum(account.contractValue), 0);
  const reportedValueTotal = configuredReported.reduce((sum: number, account: Row) => sum + contractorNum(account.contractValue), 0);
  const totalCertified = accounts.reduce((sum: number, account: Row) => sum + contractorNum(account.certifiedAmount), 0);
  const totalPaid = accounts.reduce((sum: number, account: Row) => sum + contractorNum(account.paidAmount), 0);
  const totalAdvance = accounts.reduce((sum: number, account: Row) => sum + contractorNum(account.advance), 0);
  const totalPayable = accounts.reduce((sum: number, account: Row) => sum + contractorNum(account.payable), 0);

  const overallPhysicalProgress = reportedPhysical.length === 0 ? null
    : reportedValueTotal > 0
      ? configuredReported.reduce((sum: number, account: Row) => sum + contractorNum(account.physicalProgress) * contractorNum(account.contractValue), 0) / reportedValueTotal
      : reportedPhysical.reduce((sum: number, account: Row) => sum + contractorNum(account.physicalProgress), 0) / reportedPhysical.length;

  return {
    projectId,
    projectCode,
    accounts,
    allContracts: contracts,
    summary: {
      contractorCount: accounts.length,
      configuredContractCount: configured.length,
      unconfiguredContractCount: accounts.length - configured.length,
      contractValue: configuredValueTotal,
      certifiedAmount: totalCertified,
      paidAmount: totalPaid,
      contractorAdvance: totalAdvance,
      contractorPayable: totalPayable,
      remainingContract: configured.reduce((sum: number, account: Row) => sum + contractorNum(account.remainingContract), 0),
      overCertified: configured.reduce((sum: number, account: Row) => sum + contractorNum(account.overCertified), 0),
      certifiedProgress: percent(totalCertified, configuredValueTotal),
      paymentProgress: percent(totalPaid, configuredValueTotal),
      overallPhysicalProgress,
      physicalProgressReportedCount: reportedPhysical.length,
      progressUpdateCount: progressRows.length,
    },
  };
}