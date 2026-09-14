/* LAND VIEW — explicit employee permission policy V2
 * Employee access in the shared Admin-style workspace is opt-in. The latest
 * Permission row wins. This intentionally does not inherit old role defaults.
 */

function lv2ExplicitPermission_(session, permissionKey) {
  const principals = lv2Principals_(session).map(function(value) { return String(value || "").toLowerCase(); });
  if (!principals.length) return false;
  const key = String(permissionKey || "").trim();
  const rows = readSheet(CONFIG.SHEETS.PERMISSIONS).filter(function(row) {
    const uid = String(firstValue(row, ["User_ID", "User ID", "Employee_ID", "Employee ID"]) || "").trim().toLowerCase();
    const permission = String(firstValue(row, ["Permission", "Permission_Key", "Permission Key"]) || "").trim();
    return principals.indexOf(uid) >= 0 && permission === key;
  }).sort(function(a, b) {
    const ad = new Date(String(firstValue(a, ["Created_At", "Created At"]) || 0)).getTime() || 0;
    const bd = new Date(String(firstValue(b, ["Created_At", "Created At"]) || 0)).getTime() || 0;
    return ad - bd;
  });
  if (!rows.length) return false;
  return String(firstValue(rows[rows.length - 1], ["Status", "status"]) || "").trim().toLowerCase() === "active";
}

var LV2_PREVIOUS_PERMISSION_CHECK_ = lv2Permission_;
lv2Permission_ = function(session, key) {
  const role = lv2Role_(session);
  if (role === "admin" || role === "manager") return true;
  if (role === "accounts") return LV2_PREVIOUS_PERMISSION_CHECK_(session, key);
  if (role === "employee") return lv2ExplicitPermission_(session, key);
  return false;
};

var LV2_PREVIOUS_AUTHORIZE_ACTION_ = authorizeActionRequest;
function lv2ErpPermissionForAction_(action, params) {
  const moduleName = String(params && params.module || "").trim();
  if (moduleName === "workspacePermissionsV2") return "";
  if (moduleName === "managementDashboardV2") return "dashboard.view";
  if (moduleName === "proposalsV2") return ""; // Proposal handler enforces operation-level permissions.
  if (moduleName === "tasks") return action === "getErpRecords" ? "workflow.view" : "workflow.edit";
  if (moduleName === "attendance") return action === "getErpRecords" ? "attendance.view" : "attendance.edit";
  if (moduleName === "drawings") return action === "getErpRecords" ? "documents.view" : "documents.edit";
  if (moduleName === "expenses") return action === "getErpRecords" ? "accounts.view" : "expenses.submit";
  if (moduleName === "clients" || moduleName === "quotations") return action === "getErpRecords" ? "finance.view" : "finance.edit";
  if (moduleName === "approvals") return "requests.view";
  return "";
}

authorizeActionRequest = function(action, params) {
  const token = String(params && params.token || "").trim();
  if (!token) return LV2_PREVIOUS_AUTHORIZE_ACTION_(action, params);
  const session = readSession(token);
  if (!session || lv2Role_(session) !== "employee") return LV2_PREVIOUS_AUTHORIZE_ACTION_(action, params);

  if (["getErpRecords", "createErpRecord", "updateErpRecord"].indexOf(String(action || "")) >= 0) {
    const permission = lv2ErpPermissionForAction_(String(action || ""), params || {});
    if (permission) lv2Require_(session, permission, "This function is disabled for your employee account.");
    if (String(params && params.module || "") === "workspacePermissionsV2") return session;
    if (["managementDashboardV2", "proposalsV2"].indexOf(String(params && params.module || "")) >= 0) return session;
  }
  return LV2_PREVIOUS_AUTHORIZE_ACTION_(action, params);
};

/* Keep prospect fields available when an existing proposal is reopened for edit. */
var LV2_BASE_PROPOSAL_GET_POLICY_ = lv2ProposalGet_;
lv2ProposalGet_ = function(session, proposalId) {
  const bundle = LV2_BASE_PROPOSAL_GET_POLICY_(session, proposalId);
  if (bundle && bundle.proposal && bundle.prospect) {
    bundle.proposal.Source = String(bundle.prospect.Source || "");
    bundle.proposal.Prospect_Status = String(bundle.prospect.Status || "Prospect");
    bundle.proposal.Prospect_Notes = String(bundle.prospect.Notes || "");
  }
  return bundle;
};

/* Enforce the proposal pipeline: Save -> Review/Prepared -> Print/PDF.
 * Editing a previously reviewed proposal sends it back to Draft for re-review.
 * Conversion is allowed only after the client has accepted the proposal.
 */
var LV2_BASE_UPDATE_ERP_PIPELINE_ = updateErpRecord;
updateErpRecord = function(params) {
  const moduleName = String(params && params.module || "").trim();
  if (moduleName === "proposalsV2") {
    const op = String(params && (params.op || params.operation) || "save").trim().toLowerCase();
    const proposalId = String(params && (params.id || params.proposalId || (params.record && params.record.Proposal_ID)) || "").trim();
    const session = requireSession(params || {});

    if ((op === "save" || op === "edit") && proposalId && params && params.record) {
      params = Object.assign({}, params, { record: Object.assign({}, params.record, { Status: "Draft" }) });
    }

    if (op === "print" || op === "markprinted") {
      const bundle = lv2ProposalGet_(session, proposalId);
      const currentStatus = String(bundle && bundle.proposal && bundle.proposal.Status || "Draft");
      if (currentStatus === "Draft") throw new Error("Review the proposal and mark it Prepared before printing or saving PDF.");
    }

    if (op === "convert") {
      const bundle = lv2ProposalGet_(session, proposalId);
      const currentStatus = String(bundle && bundle.proposal && bundle.proposal.Status || "Draft");
      if (currentStatus !== "Accepted") throw new Error("Only an Accepted proposal can be converted to a project.");
      const projectId = String(params.projectId || params.Converted_Project_ID || "").trim();
      if (!projectId) throw new Error("Enter the LAND VIEW Project ID before conversion.");
    }
  }
  return LV2_BASE_UPDATE_ERP_PIPELINE_(params);
};

/* Permission-aware certificate request processing for Employee accounts. */
var LV2_BASE_CERT_PORTAL_LIST_ = certPortalAdminList_;
var LV2_BASE_CERT_PORTAL_REVIEW_ = certPortalReview_;
var LV2_BASE_CERT_PORTAL_LINK_ = certPortalLinkIssued_;

certPortalAdminList_ = function(session) {
  if (lv2Role_(session) !== "employee") return LV2_BASE_CERT_PORTAL_LIST_(session);
  lv2Require_(session, "requests.view", "You do not have permission to view certificate requests.");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CERT_PORTAL_LIST_(session); });
};

certPortalReview_ = function(params, session) {
  if (lv2Role_(session) !== "employee") return LV2_BASE_CERT_PORTAL_REVIEW_(params, session);
  lv2Require_(session, "certificates.process", "You do not have permission to approve or reject certificate requests.");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CERT_PORTAL_REVIEW_(params, session); });
};

certPortalLinkIssued_ = function(params, session) {
  if (lv2Role_(session) !== "employee") return LV2_BASE_CERT_PORTAL_LINK_(params, session);
  lv2Require_(session, "certificates.issue", "You do not have permission to issue certificates.");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CERT_PORTAL_LINK_(params, session); });
};

/* Permission-aware central certificate registry for Employee accounts. */
var LV2_BASE_CERT_REGISTRY_ = certificateRegistryFromGateway_;
certificateRegistryFromGateway_ = function(params) {
  const requested = String((params && params._certificateRegistry) || "").trim();
  if (requested !== "1") return LV2_BASE_CERT_REGISTRY_(params);
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_CERT_REGISTRY_(params);

  const op = String((params && params.registryOp) || "list").trim().toLowerCase();
  let permission = "certificates.process";
  if (op === "list") permission = "certificates.view";
  else if (op === "create" || op === "supersede") permission = "certificates.issue";
  lv2Require_(session, permission, "You do not have permission to perform this certificate action.");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CERT_REGISTRY_(params); });
};
