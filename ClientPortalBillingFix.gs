/* LAND VIEW — CLIENT PORTAL BILLING V2
 * Reads the exact LV - Auto Invoice workbook headers used by Summary/File List
 * and returns live workflow + finance data for the authenticated client project.
 */

function clientPortalNumber_(value) {
  const cleaned = String(value == null ? "" : value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned || 0);
  return isFinite(n) ? n : 0;
}

function clientPortalProjectIdV2_(row) {
  return normalizeFinanceWorkflowProjectId_(clientPortalPick_(row, [
    "FILE ID", "File ID", "File_ID", "Project_ID", "Project ID", "ProjectId", "ID", "Id", "id"
  ]));
}

function clientPortalRowsAlias_(ss, names) {
  for (let i = 0; i < names.length; i++) {
    const rows = clientPortalRows_(ss, names[i]);
    if (rows.length) return rows;
  }
  return [];
}

function clientPortalRowsForProject_(rows, projectId) {
  const id = normalizeFinanceWorkflowProjectId_(projectId);
  return (rows || []).filter(function(row) { return clientPortalProjectIdV2_(row) === id; });
}

function clientPortalSum_(rows, keys) {
  return (rows || []).reduce(function(sum, row) {
    return sum + clientPortalNumber_(clientPortalPick_(row, keys));
  }, 0);
}

function clientPortalWorkspaceV2_(params) {
  const session = clientPortalSession_(params);
  const allowedRaw = getAllowedProjectIds(session) || [];
  const allowed = allowedRaw.map(normalizeFinanceWorkflowProjectId_).filter(Boolean);
  if (!allowed.length) throw new Error("No project is linked to this client session.");

  const ss = getFinanceWorkbook_();
  const workflowSheet = ensureFinanceWorkflowSheet_(ss);
  syncBillingWorkflow_(ss, workflowSheet);
  const workflowRows = financeWorkflowRows_(workflowSheet);

  const fileListRows = clientPortalRows_(ss, "File List");
  const summaryRows = clientPortalRows_(ss, "Summary");
  const invoiceRows = clientPortalRows_(ss, "Invoice");
  const requestRows = clientCertificateRequests_();

  const designBillRows = clientPortalRows_(ss, "Design Bill");
  const designDepositRows = clientPortalRows_(ss, "Design Deposit");
  const supervisionBillRows = clientPortalRows_(ss, "Supervision Bill");
  const supervisionDepositRows = clientPortalRowsAlias_(ss, ["Supervision Deposit", "S Deposit"]);
  const othersBillRows = clientPortalRows_(ss, "Others Bill");
  const othersDepositRows = clientPortalRows_(ss, "Others Bill Deposit");

  const projects = allowed.map(function(id) {
    const fileRow = fileListRows.find(function(row) { return clientPortalProjectIdV2_(row) === id; }) || {};
    const summary = summaryRows.find(function(row) { return clientPortalProjectIdV2_(row) === id; }) || {};
    const base = Object.keys(fileRow).length ? fileRow : summary;

    const tasks = workflowRows.filter(function(row) { return normalizeFinanceWorkflowProjectId_(row.Project_ID) === id; });
    const completed = tasks.filter(function(row) { return String(row.Status || "").trim().toLowerCase() === "completed"; }).length;

    const designBills = clientPortalRowsForProject_(designBillRows, id);
    const designDeposits = clientPortalRowsForProject_(designDepositRows, id);
    const supervisionBills = clientPortalRowsForProject_(supervisionBillRows, id);
    const supervisionDeposits = clientPortalRowsForProject_(supervisionDepositRows, id);
    const otherBills = clientPortalRowsForProject_(othersBillRows, id);
    const otherDeposits = clientPortalRowsForProject_(othersDepositRows, id);

    // Exact Summary headers in LV - Auto Invoice:
    // Design Bill, DB Discount, DB Deposit, DB Due,
    // Supervision Bill, SB Discount, SB Deposit, SB Due,
    // Others Bill, OB Discount, OB Deposit, OB Due, Total DUE.
    let designBill = clientPortalNumber_(clientPortalPick_(summary, ["Design Bill", "Engineering Bill"]));
    let designPaid = clientPortalNumber_(clientPortalPick_(summary, ["DB Deposit", "Engineering Deposit", "Design Deposit"]));
    let designDue = clientPortalNumber_(clientPortalPick_(summary, ["DB Due", "Engineering Due", "Design Due"]));

    let supervisionBill = clientPortalNumber_(clientPortalPick_(summary, ["Supervision Bill"]));
    let supervisionPaid = clientPortalNumber_(clientPortalPick_(summary, ["SB Deposit", "S Deposit", "Supervision Deposit"]));
    let supervisionDue = clientPortalNumber_(clientPortalPick_(summary, ["SB Due", "Supervision Due"]));

    let othersBill = clientPortalNumber_(clientPortalPick_(summary, ["Others Bill", "Other Bill"]));
    let othersPaid = clientPortalNumber_(clientPortalPick_(summary, ["OB Deposit", "Others Deposit"]));
    let othersDue = clientPortalNumber_(clientPortalPick_(summary, ["OB Due", "Others Due"]));

    // If a Summary formula/cell is blank, derive the value directly from the billing tabs.
    if (!designBill && designBills.length) designBill = clientPortalSum_(designBills, ["Amount", "AMOUNT"]);
    if (!designPaid && designDeposits.length) designPaid = clientPortalSum_(designDeposits, ["Amount", "AMOUNT"]);
    if (!supervisionBill && supervisionBills.length) supervisionBill = clientPortalSum_(supervisionBills, ["Amount", "AMOUNT"]);
    if (!supervisionPaid && supervisionDeposits.length) supervisionPaid = clientPortalSum_(supervisionDeposits, ["Amount", "AMOUNT"]);
    if (!othersBill && otherBills.length) othersBill = clientPortalSum_(otherBills, ["Amount", "AMOUNT"]);
    if (!othersPaid && otherDeposits.length) othersPaid = clientPortalSum_(otherDeposits, ["Amount", "AMOUNT"]);

    if (!designDue && (designBill || designPaid)) designDue = Math.max(0, designBill - designPaid - clientPortalNumber_(clientPortalPick_(summary, ["DB Discount"])));
    if (!supervisionDue && (supervisionBill || supervisionPaid)) supervisionDue = Math.max(0, supervisionBill - supervisionPaid - clientPortalNumber_(clientPortalPick_(summary, ["SB Discount"])));
    if (!othersDue && (othersBill || othersPaid)) othersDue = Math.max(0, othersBill - othersPaid - clientPortalNumber_(clientPortalPick_(summary, ["OB Discount"])));

    const totalBill = designBill + supervisionBill + othersBill;
    const totalPaid = designPaid + supervisionPaid + othersPaid;
    const summaryDueValue = clientPortalPick_(summary, ["Total DUE", "Total Due", "TOTAL DUE", "Due", "Balance Due"]);
    const due = String(summaryDueValue == null ? "" : summaryDueValue).trim()
      ? clientPortalNumber_(summaryDueValue)
      : designDue + supervisionDue + othersDue;

    return {
      projectId: id,
      clientName: clientPortalClientName_(base, id),
      projectName: clientPortalClean_(clientPortalPick_(base, ["Name", "Project Name", "Project_Name", "Type", "Project Type", "Project_Type"]), 160) || id,
      location: clientPortalClean_(clientPortalPick_(base, ["Address", "Location", "Project Location", "Project_Location"]), 220),
      mobile: clientPortalPhone_(clientPortalPick_(base, ["Contact No.", "Contact No", "Contact", "Mobile", "Phone_Number"])),
      status: clientPortalClean_(clientPortalPick_(summary, ["Status"]) || clientPortalPick_(base, ["Status"]), 40) || "Active",
      finance: {
        totalBill: totalBill,
        totalPaid: totalPaid,
        due: due,
        engineeringBill: designBill,
        engineeringPaid: designPaid,
        engineeringDue: designDue,
        supervisionBill: supervisionBill,
        supervisionPaid: supervisionPaid,
        supervisionDue: supervisionDue,
        othersBill: othersBill,
        othersPaid: othersPaid,
        othersDue: othersDue
      },
      workflow: tasks,
      progress: tasks.length ? Math.round(completed * 100 / tasks.length) : 0,
      completedServices: completed,
      totalServices: tasks.length,
      invoices: clientPortalRowsForProject_(invoiceRows, id),
      billing: {
        "Design Bill": designBills,
        "Design Deposit": designDeposits,
        "Supervision Bill": supervisionBills,
        "S Deposit": supervisionDeposits,
        "Others Bill": otherBills,
        "Others Bill Deposit": otherDeposits
      },
      certificateRequests: requestRows.filter(function(row) {
        return normalizeFinanceWorkflowProjectId_(row.Project_ID) === id;
      }).map(clientCertificatePublic_)
    };
  });

  return {
    success: true,
    data: {
      projects: projects,
      client: { name: session.name || "Client", projectIds: allowed },
      source: "LV - Auto Invoice",
      updatedAt: new Date().toISOString()
    }
  };
}
