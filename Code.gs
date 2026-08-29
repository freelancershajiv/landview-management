/************************************************************
 * LAND VIEW — MANAGEMENT DATABASE
 * Google Apps Script Backend
 *
 * Compatible with:
 * LAND VIEW Next.js frontend
 *
 * Authentication:
 *   User ID + Password
 *
 * Spreadsheet sheets:
 *   Users
 *   Projects
 *   Employees
 *   Documents
 *   Site Visits
 *   Invoices
 *   Payments
 *   Bills
 *   Permissions
 *
 ************************************************************/


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {
  // Production resource IDs are stored in Apps Script Script Properties.
  // Required keys: LAND_VIEW_SPREADSHEET_ID and LAND_VIEW_ROOT_FOLDER_ID.
  SPREADSHEET_ID: "",

  // LAND VIEW master Google Drive folder.
  // Every project folder is created/reused inside this folder.
  ROOT_FOLDER_ID: "",

  // Security: short absolute lifetime plus idle timeout.
  SESSION_HOURS: 8,
  SESSION_IDLE_MINUTES: 45,
  SESSION_TOUCH_MINUTES: 5,

  // Apps Script-friendly password stretching. The unique salt is stored per user;
  // a secret pepper is generated in Script Properties and never stored in Sheets.
  PASSWORD_HASH_VERSION: "v2",
  PASSWORD_HASH_ROUNDS: 5000,
  LEGACY_PASSWORD_HASH_ROUNDS: 3000,
  LOGIN_MAX_FAILURES: 5,
  LOGIN_WINDOW_MINUTES: 15,
  LOGIN_LOCK_MINUTES: 15,

  INVOICE: {
    LOGO_FILE_NAME: "LAND VIEW Logo.png",
    TITLE: "LAND VIEW",
    SUBTITLE: "BUILDING DESIGN & ARCHITECTURE",
    BILL_LABEL: "ENGINEERING BILL",
    ADDRESS_LINE_1: "F.Rahman AC Market (2nd Floor)",
    ADDRESS_LINE_2: "S.S.K Road, Feni Sadar, Feni-3900, Bangladesh",
    EMAIL: "landviewcivil@gmail.com",
    PHONE_1: "(Engr. Rony): +88 0140 8080 400",
    PHONE_2: "(Arch. Shajiv): +88 01902 500 400"
  },

  SHEETS: {
    USERS: "Users",
    PROJECTS: "Projects",
    EMPLOYEES: "Employees",
    DOCUMENTS: "Documents",
    SITE_VISITS: "Site Visits",
    INVOICES: "Invoices",
    PAYMENTS: "Payments",
    BILLS: "Bills",
    PERMISSIONS: "Permissions",
    AUDIT_LOG: "Audit Log",
    CLIENTS: "Clients",
    TASKS: "Tasks",
    ATTENDANCE: "Attendance",
    LEAVE_REQUESTS: "Leave Requests",
    EXPENSES: "Expenses",
    QUOTATIONS: "Quotations",
    DRAWINGS: "Drawing Submissions",
    APPROVALS: "Approvals"
  }
};


/* =========================================================
   SPREADSHEET
========================================================= */

function getRequiredScriptProperty_(key) {
  const value = String(
    PropertiesService.getScriptProperties().getProperty(key) || ""
  ).trim();

  if (!value) {
    throw new Error("Missing required Script Property: " + key);
  }

  return value;
}


function getSpreadsheet() {
  const spreadsheetId = getRequiredScriptProperty_("LAND_VIEW_SPREADSHEET_ID");
  return SpreadsheetApp.openById(spreadsheetId);
}


/* =========================================================
   WEB APP
========================================================= */

function doGet(e) {

  try {

    const params =
      e && e.parameter
        ? e.parameter
        : {};

    const action =
      String(params.action || "health");

    const result =
      handleAction(
        action,
        params,
        "GET"
      );

    return jsonOutput(result);

  } catch (error) {

    return jsonOutput({
      success: false,
      error: error.message || String(error)
    });

  }

}


function doPost(e) {

  try {

    let body = {};

    if (
      e &&
      e.postData &&
      e.postData.contents
    ) {

      try {

        body =
          JSON.parse(
            e.postData.contents
          );

      } catch {

        body = {};

      }

    }

    const action =
      String(
        body.action ||
        (e && e.parameter && e.parameter.action) ||
        ""
      );

    const result =
      handleAction(
        action,
        body,
        "POST"
      );

    return jsonOutput(result);

  } catch (error) {

    return jsonOutput({
      success: false,
      error: error.message || String(error)
    });

  }

}


/* =========================================================
   ACTION ROUTER
========================================================= */

function handleAction(
  action,
  params,
  method
) {

  authorizeProxyRequest_(params);
  authorizeActionRequest(action, params);

  switch (action) {

    case "health":
      return health();

    case "login":
      return loginUser(params);

    case "logout":
      return logoutUser(params);

    case "getSession":
      return getSession(params);

    case "initializeRoleSecurity":
      return initializeRoleSecurity();

    case "getDashboard":
      return getDashboard(params);

    case "getUsers":
      return getUsers(params);

    case "createUser":
      return createUser(params);

    case "resetUserPassword":
      return resetUserPassword(params);

    case "changeOwnPassword":
      return changeOwnPassword(params);

    case "getProjects":
      return getProjects(params);

    case "getProject":
      return getProject(params);

    case "createProject":
      return createProject(params);

    case "updateProject":
      return updateProject(params);

    case "deleteProject":
      return deleteProject(params);

    case "getProjectEmployees":
      return getProjectEmployees(params);

    case "updateProjectEmployees":
      return updateProjectEmployees(params);

    case "getProjectDriveFolder":
      return getProjectDriveFolder(params);

    case "getProjectServiceFolders":
      return getProjectServiceFolders(params);

    case "uploadProjectServiceFile":
      return uploadProjectServiceFile(params);

    case "syncProjectDriveFolders":
      return syncProjectDriveFolders(params);

    case "getPublicTeam":
      return getPublicTeam(params);

    case "getPublicProjects":
      return getPublicProjects(params);

    case "getEmployees":
      return getEmployees(params);

    case "createEmployee":
      return createEmployee(params);

    case "updateEmployee":
      return updateEmployee(params);

    case "deleteEmployee":
      return deleteEmployee(params);

    case "getDocuments":
      return getDocuments(params);

    case "createDocument":
      return createDocument(params);

    case "getSiteVisits":
      return getSiteVisits(params);

    case "createSiteVisit":
      return createSiteVisit(params);

    case "getBillingDashboard":
      return getBillingDashboard(params);

    case "getProjectBilling":
      return getProjectBilling(params);

    case "getBillingRecords":
      return getBillingRecords(params);

    case "saveBill":
      return saveBill(params);

    case "createBill":
      return createBill(params);

    case "getPayments":
      return getPayments(params);

    case "savePayment":
      return savePayment(params);

    case "createPayment":
      return createPayment(params);

    case "getInvoices":
      return getInvoices(params);

    case "createInvoice":
      return createInvoice(params);

    case "getPermissions":
      return getPermissions(params);

    case "createPermission":
      return createPermission(params);

    case "getErpRecords":
      return getErpRecords(params);

    case "createErpRecord":
      return createErpRecord(params);

    case "updateErpRecord":
      return updateErpRecord(params);

    case "initializeErpSheets":
      return initializeErpSheets(params);

    default:

      return {
        success: false,
        error:
          'Unknown action: "' +
          action +
          '"'
      };

  }

}


/* =========================================================
   RESPONSE
========================================================= */

function jsonOutput(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}


/* =========================================================
   HEALTH
========================================================= */

function health() {

  const ss =
    getSpreadsheet();

  return {
    success: true,

    data: {
      status: "ok",
      system: "LAND VIEW",
      spreadsheet: ss.getName(),
      timestamp:
        new Date().toISOString()
    }
  };

}


/* =========================================================
   AUTHENTICATION + ROLE SECURITY
========================================================= */

const ROLE_ACCESS = {
  employee: [
    "getProjects", "getProject", "getDocuments", "createDocument", "getSiteVisits", "createSiteVisit", "changeOwnPassword",
    "getErpRecords", "createErpRecord", "updateErpRecord"
  ],
  client: [
    "getProjects", "getProject", "getDocuments", "getProjectBilling", "getBillingRecords", "getPayments", "getInvoices", "changeOwnPassword",
    "getErpRecords"
  ],
  accounts: [
    "getDashboard", "getProjects", "getProject", "getEmployees", "getBillingDashboard", "getProjectBilling", "getBillingRecords",
    "saveBill", "createBill", "getPayments", "savePayment", "createPayment", "getInvoices", "createInvoice",
    "getErpRecords", "createErpRecord", "updateErpRecord", "changeOwnPassword"
  ]
};

function normalizeRoleName(value) {
  return normalize(value).replace(/\s+/g, "");
}

function isAdminRole(role) {
  const r = normalizeRoleName(role);
  return r === "admin" || r === "manager";
}

function isWorkspaceRole(role) {
  const r = normalizeRoleName(role);
  return isAdminRole(r) || r === "accounts";
}

function getOrCreateProxySecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("PROXY_SHARED_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + "-" + Utilities.getUuid() + "-" + Utilities.getUuid();
    props.setProperty("PROXY_SHARED_SECRET", secret);
  }
  return secret;
}

function authorizeProxyRequest_(params) {
  const expected = String(PropertiesService.getScriptProperties().getProperty("PROXY_SHARED_SECRET") || "");
  if (!expected) throw new Error("Backend security is not initialized.");
  const supplied = String((params && params.proxySecret) || "");
  if (!constantTimeEqual_(expected, supplied)) throw new Error("Unauthorized gateway.");
}

function authorizeActionRequest(action, params) {
  // These actions do not require an authenticated user session.
  const publicActions = [
  "health",
  "login",
  "getPublicTeam",
  "getPublicProjects"
];
  if (publicActions.includes(action)) return null;

  // Every action below this point requires a valid session.
  const session = requireSession(params);

  // These actions are available to every authenticated role.
  // They are NOT public because requireSession() has already succeeded.
  const sharedAuthenticatedActions = ["getSession", "logout"];
  if (sharedAuthenticatedActions.includes(action)) return session;

  const role = normalizeRoleName(session.role);

  if (isAdminRole(role)) return session;

  const allowed = ROLE_ACCESS[role] || [];
  if (!allowed.includes(action)) {
    throw new Error("Access denied for role: " + (session.role || "Unknown"));
  }

  return session;
}

function splitIds(value) {
  if (Array.isArray(value)) {
    return value.map(x => String(x).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function uniqueIds(values) {
  const seen = {};
  return values.filter(value => {
    const key = String(value || "").trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function findUserRecordForSession(session) {
  const users = readSheet(CONFIG.SHEETS.USERS);
  const targetId = String(session.userId || "").trim();
  const targetUsername = normalize(session.username || "");

  return users.find(user => {
    const userId = String(firstValue(user, ["User_ID", "User ID", "UserId"]) || "").trim();
    const username = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    return (targetId && userId === targetId) || (targetUsername && username === targetUsername);
  }) || null;
}

function getEmployeeRecordForSession(session) {
  const employees = readSheet(CONFIG.SHEETS.EMPLOYEES);
  const employeeId = String(session.employeeId || "").trim();
  const userId = String(session.userId || "").trim();

  return employees.find(employee => {
    const rowEmployeeId = String(firstValue(employee, ["Employee_ID", "Employee ID", "EmployeeId"]) || "").trim();
    const rowUserId = String(firstValue(employee, ["User_ID", "User ID", "UserId"]) || "").trim();
    return (employeeId && rowEmployeeId === employeeId) || (userId && rowUserId === userId);
  }) || null;
}

function getAllowedProjectIds(session) {
  if (isAdminRole(session.role)) return null;

  let ids = splitIds(session.projectIds || "");
  const user = findUserRecordForSession(session);

  if (user) {
    ids = ids.concat(splitIds(firstValue(user, ["Project_IDs", "Project IDs", "Projects", "Project_ID", "Project ID"])));
  }

  const role = normalizeRoleName(session.role);

  if (role === "employee") {
    const employee = getEmployeeRecordForSession(session);
    if (employee) {
      ids = ids.concat(splitIds(firstValue(employee, ["Project_IDs", "Project IDs", "Projects", "Project_ID", "Project ID"])));
    }
  }

  if (role === "client") {
    const projects = readSheet(CONFIG.SHEETS.PROJECTS);
    const userId = String(session.userId || "").trim();
    const username = normalize(session.username || "");

    projects.forEach(project => {
      const linkedUserId = String(firstValue(project, ["Client_User_ID", "Client User ID", "User_ID", "User ID"]) || "").trim();
      const linkedUsername = normalize(firstValue(project, ["Client_Username", "Client Username"]));
      if ((userId && linkedUserId === userId) || (username && linkedUsername === username)) {
        ids.push(String(firstValue(project, ["Project_ID", "Project ID", "ProjectId"]) || "").trim());
      }
    });
  }

  return uniqueIds(ids);
}

function assertProjectAccess(session, projectId) {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Project ID is required.");
  if (isAdminRole(session.role)) return true;

  const allowed = getAllowedProjectIds(session) || [];
  if (!allowed.includes(id)) {
    throw new Error("Access denied to project " + id + ".");
  }
  return true;
}

function scopeProjectRecordsForSession(session, records) {
  if (isAdminRole(session.role)) return records;
  const allowed = getAllowedProjectIds(session) || [];
  return records.filter(record => {
    const projectId = String(firstValue(record, ["Project_ID", "Project ID", "ProjectId"]) || "").trim();
    return allowed.includes(projectId);
  });
}


function sanitizeProjectForRole(project, role) {
  const r = normalizeRoleName(role);
  if (r === "admin" || r === "manager") return project;

  return {
    Project_ID: firstValue(project, ["Project_ID", "Project ID", "ProjectId"]),
    Project_Name: firstValue(project, ["Project_Name", "Project Name", "Name"]),
    Client_Name: r === "client" ? firstValue(project, ["Client_Name", "Client Name"]) : "",
    Project_Type: firstValue(project, ["Project_Type", "Project Type"]),
    Location: firstValue(project, ["Location", "Project_Location", "Project Location"]),
    Status: firstValue(project, ["Status", "status"]),
    Start_Date: firstValue(project, ["Start_Date", "Start Date"])
  };
}

function sanitizeDocumentForClient(record) {
  return {
    Document_ID: firstValue(record, ["Document_ID", "Document ID"]),
    Project_ID: firstValue(record, ["Project_ID", "Project ID"]),
    Document_Name: firstValue(record, ["Document_Name", "Document Name", "Name"]),
    Document_Type: firstValue(record, ["Document_Type", "Document Type", "Type"]),
    Document_Date: firstValue(record, ["Document_Date", "Document Date"]),
    File_URL: firstValue(record, ["File_URL", "File URL", "URL", "Document_URL"])
  };
}

function sanitizeInvoiceForClient(record) {
  return {
    Invoice_ID: firstValue(record, ["Invoice_ID", "Invoice ID"]),
    Project_ID: firstValue(record, ["Project_ID", "Project ID"]),
    Invoice_Date: firstValue(record, ["Invoice_Date", "Invoice Date"]),
    Status: firstValue(record, ["Status", "status"]),
    Total_Bill: firstValue(record, ["Total_Bill", "Total Bill", "Amount"]),
    Total_Paid: firstValue(record, ["Total_Paid", "Total Paid"]),
    Due_Amount: firstValue(record, ["Due_Amount", "Due Amount", "Due"]),
    PDF_URL: firstValue(record, ["PDF_URL", "PDF URL", "Invoice_URL"]),
    Download_URL: firstValue(record, ["Download_URL", "Download URL"])
  };
}
function isClientVisible(record) {
  const value = firstValue(record, ["Client_Visible", "Client Visible", "Visible_To_Client", "Visible to Client"]);
  const v = normalize(value);
  return v === "true" || v === "yes" || v === "1" || v === "client" || v === "shared";
}

function sanitizeBillingRecordForClient(record, kind) {
  if (kind === "payment") {
    return {
      Payment_ID: firstValue(record, ["Payment_ID", "Payment ID"]),
      Project_ID: firstValue(record, ["Project_ID", "Project ID"]),
      Payment_Date: firstValue(record, ["Payment_Date", "Payment Date"]),
      Amount: firstValue(record, ["Amount", "Payment_Amount"]),
      Payment_Method: firstValue(record, ["Payment_Method", "Payment Method"]),
      Reference_No: firstValue(record, ["Reference_No", "Reference No"])
    };
  }

  return {
    Bill_ID: firstValue(record, ["Bill_ID", "Bill ID"]),
    Project_ID: firstValue(record, ["Project_ID", "Project ID"]),
    Bill_Date: firstValue(record, ["Bill_Date", "Bill Date"]),
    Description: firstValue(record, ["Description", "Service", "Item"]),
    Amount: firstValue(record, ["Amount", "Bill_Amount", "Total", "Grand_Total"]),
    Status: firstValue(record, ["Status", "status"])
  };
}

function loginUser(params) {
  const identifier = String(params.userId || params.User_ID || params.username || params.Username || "").trim();
  const password = String(params.password || params.Password || "");

  if (!identifier || !password) {
    return { success: false, message: "Invalid User ID or password." };
  }

  try {
    assertLoginAllowed_(identifier);
  } catch (e) {
    auditSecurityEvent_(null, "LOGIN_BLOCKED", sha256Hex_(normalize(identifier)), "DENIED", "Rate limit");
    return { success: false, message: e.message || "Too many failed sign-in attempts. Try again later." };
  }

  const users = readSheet(CONFIG.SHEETS.USERS);
  if (!users || !users.length) {
    return { success: false, message: "Invalid User ID or password." };
  }

  const normalizedIdentifier = normalize(identifier);
  const phoneIdentifier = normalizePhoneIdentifier(identifier);
  let foundUser = null;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    const identifierMatches = normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);

    if (identifierMatches && isActiveUser(user) && verifyUserPassword_(user, password)) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    registerFailedLogin_(identifier);
    auditSecurityEvent_(null, "LOGIN_FAILED", sha256Hex_(normalize(identifier)), "DENIED", "Invalid credentials");
    return { success: false, message: "Invalid User ID or password." };
  }

  clearLoginGuard_(identifier);

  // Transparently upgrade plaintext, legacy, or lower-cost hashes after a successful login.
  if (userPasswordNeedsUpgrade_(foundUser)) {
    migrateUserPasswordRow_(foundUser, password);
  }

  const role = normalizeRoleName(firstValue(foundUser, ["Role", "role"]));
  if (!["admin", "manager", "employee", "client"].includes(role)) {
    return { success: false, message: "This account does not have a supported LAND VIEW role." };
  }

  const token = createSession(foundUser);
  const safeUser = sanitizeUser(foundUser);
  auditSecurityEvent_({ userId: safeUser.userId, role: safeUser.role }, "LOGIN", "", "SUCCESS", "");
  return { success: true, data: { token: token, user: safeUser } };
}

function createSession(user) {
  const token = Utilities.getUuid() + "-" + Utilities.getUuid() + "-" + Utilities.getUuid();
  const now = Date.now();
  const session = {
    userId: String(firstValue(user, ["User_ID", "User ID", "UserId"]) || ""),
    username: String(firstValue(user, ["Username", "username", "User_Name", "User Name"]) || ""),
    name: String(firstValue(user, ["Name", "name"]) || ""),
    role: String(firstValue(user, ["Role", "role"]) || ""),
    employeeId: String(firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId"]) || ""),
    projectIds: String(firstValue(user, ["Project_IDs", "Project IDs", "Projects", "Project_ID", "Project ID"]) || ""),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + Number(CONFIG.SESSION_HOURS || 8) * 60 * 60 * 1000
  };

  PropertiesService.getScriptProperties().setProperty(sessionPropertyKey_(token), JSON.stringify(session));
  return token;
}

function readSession(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return null;

  const props = PropertiesService.getScriptProperties();
  const key = sessionPropertyKey_(cleanToken);
  const raw = props.getProperty(key);
  if (!raw) return null;

  let session;
  try {
    session = JSON.parse(raw);
  } catch (e) {
    props.deleteProperty(key);
    return null;
  }

  const now = Date.now();
  const idleMs = Number(CONFIG.SESSION_IDLE_MINUTES || 45) * 60 * 1000;
  if (!session || !session.expiresAt || now > Number(session.expiresAt) || (session.lastSeenAt && now - Number(session.lastSeenAt) > idleMs)) {
    props.deleteProperty(key);
    return null;
  }

  const touchMs = Number(CONFIG.SESSION_TOUCH_MINUTES || 5) * 60 * 1000;
  if (!session.lastSeenAt || now - Number(session.lastSeenAt) >= touchMs) {
    session.lastSeenAt = now;
    props.setProperty(key, JSON.stringify(session));
  }

  return session;
}

function getSession(params) {
  const session = readSession(String(params.token || "").trim());
  if (!session) return { success: false, message: "Session expired." };

  return {
    success: true,
    data: {
      authenticated: true,
      user: {
        userId: session.userId,
        username: session.username,
        name: session.name,
        role: session.role,
        employeeId: session.employeeId || "",
        projectIds: session.projectIds || "",
        User_ID: session.userId,
        Username: session.username,
        Name: session.name,
        Role: session.role,
        Employee_ID: session.employeeId || "",
        Project_IDs: session.projectIds || ""
      }
    }
  };
}

function requireSession(params) {
  const token = String(params.token || "").trim();
  if (!token) throw new Error("Unauthorized");
  const session = readSession(token);
  if (!session) throw new Error("Unauthorized");
  return session;
}

function logoutUser(params) {
  const token = String(params.token || "").trim();
  const session = token ? readSession(token) : null;
  if (token) PropertiesService.getScriptProperties().deleteProperty(sessionPropertyKey_(token));
  if (session) auditSecurityEvent_(session, "LOGOUT", "", "SUCCESS", "");
  return { success: true, data: { loggedOut: true } };
}

function sanitizeUser(user) {
  const userId = firstValue(user, ["User_ID", "User ID", "UserId"]);
  const username = firstValue(user, ["Username", "username", "User_Name", "User Name"]);
  const name = firstValue(user, ["Name", "name"]);
  const role = firstValue(user, ["Role", "role"]);
  const employeeId = firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId"]);
  const projectIds = firstValue(user, ["Project_IDs", "Project IDs", "Projects", "Project_ID", "Project ID"]);

  return {
    userId, username, name, role, employeeId, projectIds,
    User_ID: userId, Username: username, Name: name, Role: role,
    Employee_ID: employeeId, Project_IDs: projectIds
  };
}

function ensureHeaders_(sheet, requiredHeaders) {
  let headers = getHeaders(sheet);
  requiredHeaders.forEach(header => {
    if (findHeaderIndex(headers, [header]) < 0) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });
  return headers;
}

function ensureUserSecurityHeaders() {
  return ensureHeaders_(getSheet(CONFIG.SHEETS.USERS), [
    "Employee_ID",
    "Project_IDs",
    "Must_Change_Password",
    "Created_Date",
    "Password_Hash",
    "Password_Salt",
    "Password_Updated_At"
  ]);
}

function ensureProjectClientSecurityHeaders() {
  return ensureHeaders_(getSheet(CONFIG.SHEETS.PROJECTS), [
    "Client_User_ID",
    "Client_Username"
  ]);
}

function normalizePhoneIdentifier(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.indexOf("880") === 0 && digits.length >= 13) {
    digits = "0" + digits.substring(3);
  } else if (digits.indexOf("88") === 0 && digits.length >= 13) {
    digits = digits.substring(2);
  }
  return digits;
}

function generateTemporaryPassword_() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  let out = "Lv@";
  for (let i = 0; i < 7; i++) {
    const n = Math.abs(bytes[i]) % alphabet.length;
    out += alphabet.charAt(n);
  }
  return out + "!";
}


function bytesToHex_(bytes) {
  return bytes.map(function(b) {
    const n = b < 0 ? b + 256 : b;
    return ("0" + n.toString(16)).slice(-2);
  }).join("");
}

function sha256Hex_(value) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""), Utilities.Charset.UTF_8));
}

function getAuthPepper_() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty("AUTH_PEPPER");
  if (!pepper) {
    pepper = Utilities.getUuid() + "-" + Utilities.getUuid() + "-" + Utilities.getUuid();
    props.setProperty("AUTH_PEPPER", pepper);
  }
  return pepper;
}

function newPasswordSalt_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function derivePasswordHashWithRounds_(password, salt, rounds) {
  const pepper = getAuthPepper_();
  const cleanSalt = String(salt || "");
  let value = cleanSalt + "|" + String(password || "") + "|" + pepper;
  const count = Math.max(1, Number(rounds || 1));

  for (let i = 0; i < count; i++) {
    value = sha256Hex_(value + "|" + cleanSalt + "|" + pepper);
  }

  return value;
}


function derivePasswordHash_(password, salt) {
  const version = String(CONFIG.PASSWORD_HASH_VERSION || "v2");
  const rounds = Math.max(1, Number(CONFIG.PASSWORD_HASH_ROUNDS || 5000));
  const digest = derivePasswordHashWithRounds_(password, salt, rounds);
  return version + "$" + rounds + "$" + digest;
}


function parseVersionedPasswordHash_(storedHash) {
  const match = String(storedHash || "").match(/^([A-Za-z0-9_-]+)\$(\d+)\$([0-9a-f]{64})$/i);
  if (!match) return null;

  return {
    version: match[1],
    rounds: Number(match[2]),
    digest: match[3].toLowerCase()
  };
}

function constantTimeEqual_(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function passwordFields_(password) {
  const salt = newPasswordSalt_();
  return {
    Password: "",
    Password_Hash: derivePasswordHash_(password, salt),
    Password_Salt: salt,
    Password_Updated_At: new Date().toISOString()
  };
}

function verifyUserPassword_(user, password) {
  const hash = String(firstValue(user, ["Password_Hash", "Password Hash"]) || "");
  const salt = String(firstValue(user, ["Password_Salt", "Password Salt"]) || "");

  if (hash && salt) {
    const versioned = parseVersionedPasswordHash_(hash);

    if (versioned) {
      if (versioned.version !== String(CONFIG.PASSWORD_HASH_VERSION || "v2")) {
        return false;
      }

      const calculated = derivePasswordHashWithRounds_(password, salt, versioned.rounds);
      return constantTimeEqual_(versioned.digest, calculated);
    }

    // Backward compatibility with the original unversioned 3,000-round hash.
    const legacyRounds = Math.max(1, Number(CONFIG.LEGACY_PASSWORD_HASH_ROUNDS || 3000));
    const legacyHash = derivePasswordHashWithRounds_(password, salt, legacyRounds);
    return constantTimeEqual_(hash, legacyHash);
  }

  // Temporary backward compatibility for accounts that still contain plaintext.
  return constantTimeEqual_(
    String(firstValue(user, ["Password", "password"]) || ""),
    String(password || "")
  );
}


function userPasswordNeedsUpgrade_(user) {
  const hash = String(firstValue(user, ["Password_Hash", "Password Hash"]) || "");
  const parsed = parseVersionedPasswordHash_(hash);

  if (!parsed) return true;

  return (
    parsed.version !== String(CONFIG.PASSWORD_HASH_VERSION || "v2") ||
    parsed.rounds < Math.max(1, Number(CONFIG.PASSWORD_HASH_ROUNDS || 5000))
  );
}

function migrateUserPasswordRow_(user, plainPassword) {
  const userId = String(firstValue(user, ["User_ID", "User ID", "UserId"]) || "").trim();
  if (!userId) return;
  const found = findUserRow_(function(u) {
    return String(firstValue(u, ["User_ID", "User ID", "UserId"]) || "").trim() === userId;
  });
  if (found) setRowValuesByHeader_(found, passwordFields_(plainPassword));
}

function sessionPropertyKey_(token) {
  return "SESSION_" + sha256Hex_(String(token || "") + "|" + getAuthPepper_());
}

function revokeUserSessions_(userId) {
  const target = String(userId || "").trim();
  if (!target) return;
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf("SESSION_") !== 0) return;
    try {
      const session = JSON.parse(all[key]);
      if (String(session.userId || "").trim() === target) props.deleteProperty(key);
    } catch (e) {}
  });
}

function loginGuardKey_(identifier) {
  return "LOGIN_GUARD_" + sha256Hex_(normalize(identifier) + "|" + getAuthPepper_());
}

function readLoginGuard_(identifier) {
  const raw = PropertiesService.getScriptProperties().getProperty(loginGuardKey_(identifier));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function assertLoginAllowed_(identifier) {
  const guard = readLoginGuard_(identifier);
  if (guard && Number(guard.lockedUntil || 0) > Date.now()) {
    throw new Error("Too many failed sign-in attempts. Try again later.");
  }
}

function registerFailedLogin_(identifier) {
  const props = PropertiesService.getScriptProperties();
  const key = loginGuardKey_(identifier);
  const now = Date.now();
  const windowMs = Number(CONFIG.LOGIN_WINDOW_MINUTES || 15) * 60 * 1000;
  const lockMs = Number(CONFIG.LOGIN_LOCK_MINUTES || 15) * 60 * 1000;
  let guard = readLoginGuard_(identifier) || { failures: 0, windowStartedAt: now, lockedUntil: 0 };
  if (!guard.windowStartedAt || now - Number(guard.windowStartedAt) > windowMs) {
    guard = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
  }
  guard.failures = Number(guard.failures || 0) + 1;
  if (guard.failures >= Number(CONFIG.LOGIN_MAX_FAILURES || 5)) guard.lockedUntil = now + lockMs;
  props.setProperty(key, JSON.stringify(guard));
}

function clearLoginGuard_(identifier) {
  PropertiesService.getScriptProperties().deleteProperty(loginGuardKey_(identifier));
}

function ensureAuditLog_() {
  const sheet = getSheet(CONFIG.SHEETS.AUDIT_LOG);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "User_ID", "Role", "Action", "Target", "Result", "Details"]);
  }
  return sheet;
}

function auditSecurityEvent_(session, action, target, result, details) {
  try {
    ensureAuditLog_().appendRow([
      new Date(),
      session && session.userId ? session.userId : "",
      session && session.role ? session.role : "",
      String(action || ""),
      String(target || ""),
      String(result || ""),
      String(details || "").slice(0, 500)
    ]);
  } catch (e) {}
}

// Run once from the Apps Script editor after deploying this upgrade.
// It creates the security fields, secret pepper, audit log, and migrates plaintext passwords.
function initializeSecurityUpgrade() {
  ensureUserSecurityHeaders();
  ensureAuditLog_();
  getAuthPepper_();
  const proxySecret = getOrCreateProxySecret_();
  const sheet = getSheet(CONFIG.SHEETS.USERS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { migrated: 0, proxySecret: proxySecret, message: "LAND VIEW security upgrade initialized. Copy proxySecret into Vercel as LAND_VIEW_PROXY_SECRET." };
  const headers = values[0].map(function(x) { return String(x).trim(); });
  const passwordCol = findHeaderIndex(headers, ["Password", "password"]);
  const hashCol = findHeaderIndex(headers, ["Password_Hash"]);
  const saltCol = findHeaderIndex(headers, ["Password_Salt"]);
  const updatedCol = findHeaderIndex(headers, ["Password_Updated_At"]);
  let migrated = 0;
  for (let i = 1; i < values.length; i++) {
    const plain = passwordCol >= 0 ? String(values[i][passwordCol] || "") : "";
    const existingHash = hashCol >= 0 ? String(values[i][hashCol] || "") : "";
    if (!plain || existingHash) continue;
    const fields = passwordFields_(plain);
    if (passwordCol >= 0) sheet.getRange(i + 1, passwordCol + 1).setValue("");
    if (hashCol >= 0) sheet.getRange(i + 1, hashCol + 1).setValue(fields.Password_Hash);
    if (saltCol >= 0) sheet.getRange(i + 1, saltCol + 1).setValue(fields.Password_Salt);
    if (updatedCol >= 0) sheet.getRange(i + 1, updatedCol + 1).setValue(fields.Password_Updated_At);
    migrated++;
  }
  return {
    migrated: migrated,
    proxySecret: proxySecret,
    message: "LAND VIEW security upgrade initialized. Copy proxySecret into Vercel as LAND_VIEW_PROXY_SECRET."
  };
}

function findUserRow_(predicate) {
  const sheet = getSheet(CONFIG.SHEETS.USERS);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return null;
  const headers = values[0].map(x => String(x).trim());
  for (let i = 1; i < values.length; i++) {
    const row = {};
    headers.forEach((h, j) => row[h] = values[i][j]);
    if (predicate(row)) return { sheet, headers, rowIndex: i + 1, record: row };
  }
  return null;
}

function setRowValuesByHeader_(found, updates) {
  Object.keys(updates).forEach(key => {
    const col = findHeaderIndex(found.headers, [key]);
    if (col >= 0) found.sheet.getRange(found.rowIndex, col + 1).setValue(updates[key]);
  });
}

function appendUserRecord_(record) {
  const sheet = getSheet(CONFIG.SHEETS.USERS);
  const headers = ensureUserSecurityHeaders();
  if (!record.User_ID) record.User_ID = generateId("USR-", sheet, "User_ID");
  sheet.appendRow(headers.map(h => record[h] ?? ""));
  return record;
}

function ensureEmployeeLoginAccount_(employee) {
  const employeeId = String(firstValue(employee, ["Employee_ID", "Employee ID", "EmployeeId"]) || "").trim();
  if (!employeeId) throw new Error("Employee_ID is required to create an employee login.");

  const existing = findUserRow_(u =>
    normalizeRoleName(firstValue(u, ["Role", "role"])) === "employee" &&
    (String(firstValue(u, ["Employee_ID", "Employee ID"]) || "").trim() === employeeId ||
     normalize(firstValue(u, ["User_ID", "User ID"])) === normalize(employeeId) ||
     normalize(firstValue(u, ["Username", "username"])) === normalize(employeeId))
  );

  if (existing) {
    setRowValuesByHeader_(existing, {
      Name: firstValue(employee, ["Employee_Name", "Employee Name", "Name"]) || employeeId,
      Employee_ID: employeeId,
      Active: "TRUE"
    });
    return { created: false, userId: firstValue(existing.record, ["User_ID"]), username: firstValue(existing.record, ["Username"]) || employeeId, temporaryPassword: "" };
  }

  const temporaryPassword = generateTemporaryPassword_();
  const record = appendUserRecord_(Object.assign({
    User_ID: employeeId,
    Name: firstValue(employee, ["Employee_Name", "Employee Name", "Name"]) || employeeId,
    Username: employeeId,
    Role: "Employee",
    Active: "TRUE",
    Employee_ID: employeeId,
    Project_IDs: firstValue(employee, ["Project_IDs", "Project IDs", "Projects", "Project_ID"]) || "",
    Must_Change_Password: "TRUE",
    Created_Date: new Date()
  }, passwordFields_(temporaryPassword)));
  return { created: true, userId: record.User_ID, username: record.Username, temporaryPassword };
}

function ensureClientLoginAccountForProject_(project) {
  const projectId = String(firstValue(project, ["Project_ID", "Project ID", "ProjectId"]) || "").trim();
  const phoneRaw = String(firstValue(project, ["Phone_Number", "Phone Number", "Phone", "Client_Phone"]) || "").trim();
  const username = normalizePhoneIdentifier(phoneRaw);
  if (!projectId || !username) return { created: false, skipped: true, reason: "Client phone number not provided." };

  const existing = findUserRow_(u => {
    if (normalizeRoleName(firstValue(u, ["Role", "role"])) !== "client") return false;
    return normalizePhoneIdentifier(firstValue(u, ["Username", "username", "Phone", "Phone_Number"])) === username;
  });

  if (existing) {
    const ids = uniqueIds(splitIds(firstValue(existing.record, ["Project_IDs", "Project IDs", "Projects"])).concat([projectId]));
    setRowValuesByHeader_(existing, {
      Name: firstValue(project, ["Client_Name", "Client Name"]) || firstValue(existing.record, ["Name"]) || "LAND VIEW Client",
      Username: username,
      Project_IDs: ids.join(", "),
      Active: "TRUE"
    });
    const userId = String(firstValue(existing.record, ["User_ID"]) || "");
    project.Client_User_ID = userId;
    project.Client_Username = username;
    return { created: false, userId, username, temporaryPassword: "", projectIds: ids.join(", ") };
  }

  const usersSheet = getSheet(CONFIG.SHEETS.USERS);
  ensureUserSecurityHeaders();
  const temporaryPassword = generateTemporaryPassword_();
  const userId = generateId("CLT-", usersSheet, "User_ID");
  appendUserRecord_(Object.assign({
    User_ID: userId,
    Name: firstValue(project, ["Client_Name", "Client Name"]) || "LAND VIEW Client",
    Username: username,
    Role: "Client",
    Active: "TRUE",
    Employee_ID: "",
    Project_IDs: projectId,
    Must_Change_Password: "TRUE",
    Created_Date: new Date()
  }, passwordFields_(temporaryPassword)));
  project.Client_User_ID = userId;
  project.Client_Username = username;
  return { created: true, userId, username, temporaryPassword, projectIds: projectId };
}

function initializeRoleSecurity() {
  ensureUserSecurityHeaders();
  ensureProjectClientSecurityHeaders();
  ensureAuditLog_();
  getAuthPepper_();

  const documentSheet = getSheet(CONFIG.SHEETS.DOCUMENTS);
  let documentHeaders = getHeaders(documentSheet);
  if (findHeaderIndex(documentHeaders, ["Client_Visible", "Client Visible"]) < 0) {
    documentSheet.getRange(1, documentHeaders.length + 1).setValue("Client_Visible");
  }

  return {
    success: true,
    data: {
      initialized: true,
      message: "Role security and automatic employee/client account fields are ready."
    }
  };
}

function sanitizeUserForAdminList_(user) {
  return {
    User_ID: firstValue(user, ["User_ID", "User ID"]),
    Name: firstValue(user, ["Name", "name"]),
    Username: firstValue(user, ["Username", "username"]),
    Role: firstValue(user, ["Role", "role"]),
    Active: firstValue(user, ["Active", "Status"]),
    Employee_ID: firstValue(user, ["Employee_ID", "Employee ID"]),
    Project_IDs: firstValue(user, ["Project_IDs", "Project IDs", "Projects"]),
    Must_Change_Password: firstValue(user, ["Must_Change_Password"]),
    Created_Date: firstValue(user, ["Created_Date", "Created Date"])
  };
}

function resetUserPassword(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  const target = String(params.userId || params.User_ID || "").trim();
  if (!target) throw new Error("User ID is required.");
  const found = findUserRow_(function(u) { return String(firstValue(u, ["User_ID", "User ID"]) || "").trim() === target; });
  if (!found) throw new Error("User not found.");
  const temporaryPassword = generateTemporaryPassword_();
  setRowValuesByHeader_(found, Object.assign({}, passwordFields_(temporaryPassword), { Must_Change_Password: "TRUE", Active: "TRUE" }));
  revokeUserSessions_(target);
  auditSecurityEvent_(session, "RESET_PASSWORD", target, "SUCCESS", "");
  return { success: true, data: { userId: target, username: firstValue(found.record, ["Username"]), temporaryPassword } };
}

function changeOwnPassword(params) {
  const session = requireSession(params);
  const currentPassword = String(params.currentPassword || "");
  const newPassword = String(params.newPassword || "");
  if (newPassword.length < 10) throw new Error("New password must be at least 10 characters.");
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw new Error("Use upper and lower case letters, a number, and a symbol.");
  }
  const found = findUserRow_(function(u) { return String(firstValue(u, ["User_ID", "User ID"]) || "").trim() === String(session.userId || "").trim(); });
  if (!found) throw new Error("User not found.");
  if (!verifyUserPassword_(found.record, currentPassword)) throw new Error("Current password is incorrect.");
  setRowValuesByHeader_(found, Object.assign({}, passwordFields_(newPassword), { Must_Change_Password: "FALSE" }));
  revokeUserSessions_(session.userId);
  auditSecurityEvent_(session, "CHANGE_PASSWORD", session.userId, "SUCCESS", "All sessions revoked");
  return { success: true, data: { changed: true, reauthenticationRequired: true } };
}

/* =========================================================
   USERS
========================================================= */

function getUsers(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  return {
    success: true,
    data: readSheet(CONFIG.SHEETS.USERS).map(sanitizeUserForAdminList_)
  };
}


function createUser(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  const user = Object.assign({}, params.user || params);
  delete user.action;
  delete user.token;
  delete user.proxySecret;

  const plainPassword = String(user.Password || user.password || "");
  delete user.password;
  if (plainPassword) Object.assign(user, passwordFields_(plainPassword));

  const sheet = getSheet(CONFIG.SHEETS.USERS);
  const headers = ensureUserSecurityHeaders();
  if (!user.User_ID && !user.userId) user.User_ID = generateId("USR-", sheet, "User_ID");

  const row = headers.map(function(header) {
    if (header === "User_ID") return user.User_ID || user.userId || "";
    return user[header] !== undefined ? user[header] : "";
  });
  sheet.appendRow(row);

  auditSecurityEvent_(session, "CREATE_USER", user.User_ID || user.userId || "", "SUCCESS", String(user.Role || user.role || ""));
  return { success: true, data: { created: true, user: sanitizeUserForAdminList_(user) } };
}

/* =========================================================
   PROJECTS/* =========================================================
   PROJECTS
========================================================= */

function getProjects(params) {
  const session = requireSession(params);
  let projects = scopeProjectRecordsForSession(session, readSheet(CONFIG.SHEETS.PROJECTS));
  if (!isAdminRole(session.role)) {
    projects = projects.map(project => sanitizeProjectForRole(project, session.role));
  }
  return { success: true, data: projects };
}


function getProject(params) {
  const session = requireSession(params);
  const projectId = String(params.projectId || "").trim();
  assertProjectAccess(session, projectId);

  const project = readSheet(CONFIG.SHEETS.PROJECTS).find(p =>
    String(firstValue(p, ["Project_ID", "Project ID", "ProjectId"]) || "").trim() === projectId
  );

  if (!project) throw new Error("Project not found.");
  return { success: true, data: sanitizeProjectForRole(project, session.role) };
}


function createProject(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  const project =
    Object.assign({}, params);

  delete project.action;
  delete project.token;
  delete project.proxySecret;


  const sheet =
    getSheet(
      CONFIG.SHEETS.PROJECTS
    );


  ensureProjectDriveHeaders(sheet);
  ensureProjectClientSecurityHeaders();

  const headers = getHeaders(sheet);


  if (!project.Project_ID) {

    project.Project_ID =
      generateId(
        "LV-",
        sheet,
        "Project_ID"
      );

  }


  /*
   * Create the complete Google Drive structure BEFORE the
   * project row is written, so a newly created project is
   * immediately ready for documents and invoices.
   */
  const drive =
    ensureProjectDriveStructureForRecord(
      project
    );


  applyDriveStructureToProject(
    project,
    drive
  );

  const clientAccount = ensureClientLoginAccountForProject_(project);

  const row =
    headers.map(
      h =>
        project[h] ??
        ""
    );


  sheet.appendRow(row);


  return {
    success: true,
    data: Object.assign({}, project, { project: project, clientAccount: clientAccount })
  };

}


function updateProject(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  const projectId =
    String(
      params.projectId || ""
    ).trim();


  if (!projectId) {
    throw new Error(
      "Project ID is required."
    );
  }


  const sheet =
    getSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const headers =
    getHeaders(sheet);


  const idColumn =
    findHeaderIndex(
      headers,
      [
        "Project_ID",
        "Project ID",
        "ProjectId"
      ]
    );


  if (idColumn < 0) {
    throw new Error(
      "Project_ID column not found."
    );
  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(
        values[i][idColumn]
      ).trim() === projectId
    ) {

      Object.keys(params)
        .forEach(
          key => {

            if (
              key === "action" ||
              key === "token" ||
              key === "projectId"
            ) {
              return;
            }


            const column =
              findHeaderIndex(
                headers,
                [key]
              );


            if (column >= 0) {

              sheet
                .getRange(
                  i + 1,
                  column + 1
                )
                .setValue(
                  params[key]
                );

            }

          }
        );


      return {
        success: true,
        data: {
          updated: true,
          projectId: projectId
        }
      };

    }

  }


  throw new Error(
    "Project not found."
  );

}


function deleteProject(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  const projectId =
    String(
      params.projectId || ""
    ).trim();


  const sheet =
    getSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const headers =
    getHeaders(sheet);


  const idColumn =
    findHeaderIndex(
      headers,
      [
        "Project_ID",
        "Project ID",
        "ProjectId"
      ]
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(
        values[i][idColumn]
      ).trim() === projectId
    ) {

      sheet.deleteRow(
        i + 1
      );

      return {
        success: true,
        data: {
          deleted: true
        }
      };

    }

  }


  throw new Error(
    "Project not found."
  );

}


/* =========================================================
   PROJECT EMPLOYEES
========================================================= */

function getProjectEmployees(params) {

  const session = requireSession(params);

  const projectId =
    String(
      params.projectId || ""
    ).trim();

  assertProjectAccess(session, projectId);


  const employees =
    readSheet(
      CONFIG.SHEETS.EMPLOYEES
    );


  return {
    success: true,

    data:
      employees.filter(
        employee => {

          const projects =
            String(
              firstValue(
                employee,
                [
                  "Project_ID",
                  "Project_IDs",
                  "Projects"
                ]
              ) || ""
            );

          return projects
            .split(",")
            .map(x => x.trim())
            .includes(projectId);

        }
      )
  };

}


function updateProjectEmployees(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  const projectId =
    String(
      params.projectId || ""
    ).trim();


  let employeeIds =
    params.employeeIds || [];


  if (
    typeof employeeIds === "string"
  ) {

    try {

      employeeIds =
        JSON.parse(
          employeeIds
        );

    } catch {

      employeeIds =
        employeeIds
          .split(",")
          .map(
            x => x.trim()
          );

    }

  }


  const sheet =
    getSheet(
      CONFIG.SHEETS.EMPLOYEES
    );


  const headers =
    getHeaders(sheet);


  const projectColumn =
    findHeaderIndex(
      headers,
      [
        "Project_ID",
        "Project_IDs",
        "Projects"
      ]
    );


  const employeeIdColumn =
    findHeaderIndex(
      headers,
      [
        "Employee_ID",
        "Employee ID",
        "EmployeeId"
      ]
    );


  if (
    projectColumn < 0 ||
    employeeIdColumn < 0
  ) {

    throw new Error(
      "Employee project columns not found."
    );

  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const employeeId =
      String(
        values[i][employeeIdColumn]
      ).trim();


    const current =
      String(
        values[i][projectColumn] || ""
      );


    let projects =
      current
        ? current
            .split(",")
            .map(x => x.trim())
            .filter(Boolean)
        : [];


    const selected =
      employeeIds
        .map(
          x => String(x).trim()
        )
        .includes(employeeId);


    if (selected) {

      if (
        !projects.includes(projectId)
      ) {

        projects.push(
          projectId
        );

      }

    } else {

      projects =
        projects.filter(
          p => p !== projectId
        );

    }


    sheet
      .getRange(
        i + 1,
        projectColumn + 1
      )
      .setValue(
        projects.join(", ")
      );

  }


  return {
    success: true,

    data: {
      updated: true,
      projectId: projectId,
      employeeIds: employeeIds
    }
  };

}


/* =========================================================
   DRIVE
========================================================= */

function getProjectDriveFolder(params) {
  const session = requireSession(params);
  const projectId = String(params.projectId || params.Project_ID || "").trim();
  assertProjectAccess(session, projectId);

  const drive = ensureProjectDriveStructure(projectId);
  return {
    success: true,
    data: {
      projectId: projectId,
      folderId: drive.projectFolder.getId(),
      url: drive.projectFolder.getUrl(),
      documentsFolderId: drive.documentsFolder.getId(),
      documentsUrl: drive.documentsFolder.getUrl(),
      invoicesFolderId: drive.invoicesFolder.getId(),
      invoicesUrl: drive.invoicesFolder.getUrl(),
      rootFolderId: drive.rootFolder.getId(),
      rootUrl: drive.rootFolder.getUrl()
    }
  };
}


/* =========================================================
   DRIVE — AUTOMATIC PROJECT FOLDER STRUCTURE
========================================================= */

function getLandViewRootFolder() {

  const rootFolderId =
    getRequiredScriptProperty_("LAND_VIEW_ROOT_FOLDER_ID");


  try {

    return DriveApp
      .getFolderById(
        rootFolderId
      );

  } catch (error) {

    throw new Error(
      "LAND VIEW root Drive folder could not be opened. Check LAND_VIEW_ROOT_FOLDER_ID in Script Properties and Apps Script Drive permissions."
    );

  }

}


function ensureProjectDriveHeaders(sheet) {

  const requiredHeaders = [
    "Drive_Folder_ID",
    "Drive_Folder_URL",
    "Documents_Folder_ID",
    "Documents_Folder_URL",
    "Invoices_Folder_ID",
    "Invoices_Folder_URL"
  ];


  let headers =
    getHeaders(
      sheet
    );


  requiredHeaders.forEach(
    header => {

      if (
        findHeaderIndex(
          headers,
          [header]
        ) < 0
      ) {

        sheet
          .getRange(
            1,
            headers.length + 1
          )
          .setValue(
            header
          );

        headers.push(
          header
        );

      }

    }
  );


  return headers;

}


function getProjectRecordById(projectId) {

  const target =
    String(
      projectId ||
      ""
    ).trim();


  if (!target) {

    throw new Error(
      "Project ID is required."
    );

  }


  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const project =
    projects.find(
      item =>
        String(
          firstValue(
            item,
            [
              "Project_ID",
              "Project ID",
              "ProjectId"
            ]
          ) ||
          ""
        ).trim() === target
    );


  if (!project) {

    throw new Error(
      "Project not found."
    );

  }


  return project;

}


function getProjectIdValue(project) {

  return String(
    firstValue(
      project,
      [
        "Project_ID",
        "Project ID",
        "ProjectId"
      ]
    ) ||
    ""
  ).trim();

}


function getProjectNameValue(project) {

  const projectId =
    getProjectIdValue(
      project
    );


  return String(
    firstValue(
      project,
      [
        "Project_Name",
        "Project Name",
        "Name"
      ]
    ) ||
    projectId ||
    "Project"
  ).trim();

}


function buildProjectFolderName(project) {

  const projectId =
    getProjectIdValue(
      project
    );


  const projectName =
    getProjectNameValue(
      project
    );


  const name =
    projectId &&
    projectName &&
    normalize(projectName) !==
      normalize(projectId)
      ? projectId +
        " - " +
        projectName
      : projectId ||
        projectName ||
        "LAND VIEW Project";


  return sanitizeFileName(
    name
  );

}


function tryGetFolderById(folderId) {

  const cleanId =
    String(
      folderId ||
      ""
    ).trim();


  if (!cleanId) {
    return null;
  }


  try {

    return DriveApp
      .getFolderById(
        cleanId
      );

  } catch (error) {

    return null;

  }

}


function findExistingProjectFolder(
  rootFolder,
  project
) {

  let folderId =
    String(
      firstValue(
        project,
        [
          "Drive_Folder_ID",
          "Drive Folder ID",
          "Folder_ID"
        ]
      ) ||
      ""
    ).trim();


  const folderUrl =
    String(
      firstValue(
        project,
        [
          "Drive_Folder_URL",
          "Drive Folder URL",
          "Folder_URL"
        ]
      ) ||
      ""
    ).trim();


  if (
    !folderId &&
    folderUrl
  ) {

    folderId =
      extractDriveFolderId(
        folderUrl
      );

  }


  const folderById =
    tryGetFolderById(
      folderId
    );


  if (folderById) {
    return folderById;
  }


  const desiredName =
    buildProjectFolderName(
      project
    );


  const exactFolders =
    rootFolder
      .getFoldersByName(
        desiredName
      );


  if (exactFolders.hasNext()) {
    return exactFolders.next();
  }


  /*
   * If the project name changed, reuse any existing folder
   * beginning with the same Project_ID instead of creating
   * a duplicate folder.
   */
  const projectId =
    getProjectIdValue(
      project
    );


  if (projectId) {

    const folders =
      rootFolder
        .getFolders();


    while (
      folders.hasNext()
    ) {

      const folder =
        folders.next();

      const name =
        String(
          folder.getName() ||
          ""
        );


      if (
        name === projectId ||
        name.indexOf(
          projectId +
          " - "
        ) === 0
      ) {

        return folder;

      }

    }

  }


  return null;

}


function ensureProjectDriveStructureForRecord(
  project
) {

  const projectId =
    getProjectIdValue(
      project
    );


  if (!projectId) {

    throw new Error(
      "Project_ID is required before creating its Drive folders."
    );

  }


  const rootFolder =
    getLandViewRootFolder();


  let projectFolder =
    findExistingProjectFolder(
      rootFolder,
      project
    );


  if (!projectFolder) {

    projectFolder =
      rootFolder
        .createFolder(
          buildProjectFolderName(
            project
          )
        );

  }


  const documentsFolder =
    getOrCreateChildFolder(
      projectFolder,
      "Documents"
    );


  const invoicesFolder =
    getOrCreateChildFolder(
      projectFolder,
      "Invoices"
    );

  /*
   * LAND VIEW discipline/service folders.
   * These are created automatically for every project.
   */
  const serviceFolders = {};
  getProjectServiceFolderNames_().forEach(function(folderName) {
    serviceFolders[folderName] =
      getOrCreateChildFolder(
        projectFolder,
        folderName
      );
  });


  return {
    rootFolder: rootFolder,
    projectFolder: projectFolder,
    documentsFolder: documentsFolder,
    invoicesFolder: invoicesFolder,
    serviceFolders: serviceFolders
  };

}


function applyDriveStructureToProject(
  project,
  drive
) {

  project.Drive_Folder_ID =
    drive.projectFolder.getId();

  project.Drive_Folder_URL =
    drive.projectFolder.getUrl();

  project.Documents_Folder_ID =
    drive.documentsFolder.getId();

  project.Documents_Folder_URL =
    drive.documentsFolder.getUrl();

  project.Invoices_Folder_ID =
    drive.invoicesFolder.getId();

  project.Invoices_Folder_URL =
    drive.invoicesFolder.getUrl();


  return project;

}


function writeProjectDriveStructure(
  projectId,
  drive
) {

  const sheet =
    getSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const headers =
    ensureProjectDriveHeaders(
      sheet
    );


  const idColumn =
    findHeaderIndex(
      headers,
      [
        "Project_ID",
        "Project ID",
        "ProjectId"
      ]
    );


  if (idColumn < 0) {

    throw new Error(
      "Project_ID column not found."
    );

  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  const target =
    String(
      projectId ||
      ""
    ).trim();


  const updates = {
    Drive_Folder_ID:
      drive.projectFolder.getId(),
    Drive_Folder_URL:
      drive.projectFolder.getUrl(),
    Documents_Folder_ID:
      drive.documentsFolder.getId(),
    Documents_Folder_URL:
      drive.documentsFolder.getUrl(),
    Invoices_Folder_ID:
      drive.invoicesFolder.getId(),
    Invoices_Folder_URL:
      drive.invoicesFolder.getUrl()
  };


  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {

    if (
      String(
        values[rowIndex][idColumn]
      ).trim() !== target
    ) {
      continue;
    }


    Object.keys(updates)
      .forEach(
        header => {

          const column =
            findHeaderIndex(
              headers,
              [header]
            );


          if (column >= 0) {

            sheet
              .getRange(
                rowIndex + 1,
                column + 1
              )
              .setValue(
                updates[header]
              );

          }

        }
      );


    return updates;

  }


  throw new Error(
    "Project not found while saving Drive folder information."
  );

}


function ensureProjectDriveStructure(
  projectOrId
) {

  const project =
    typeof projectOrId ===
      "string"
      ? getProjectRecordById(
          projectOrId
        )
      : projectOrId;


  if (!project) {

    throw new Error(
      "Project not found."
    );

  }


  const drive =
    ensureProjectDriveStructureForRecord(
      project
    );


  const projectId =
    getProjectIdValue(
      project
    );


  writeProjectDriveStructure(
    projectId,
    drive
  );


  applyDriveStructureToProject(
    project,
    drive
  );


  return drive;

}



/* =========================================================
   DRIVE — PROJECT SERVICE FOLDERS + FILE UPLOADS
========================================================= */

function getProjectServiceFolderNames_() {
  return [
    "Architectural Design",
    "Structural Design",
    "3D Design - Exterior",
    "3D Design - Interior",
    "Electrical Design",
    "Plumbing Design",
    "Estimate & Costing",
    "Plan Approval",
    "Digital Survey",
    "Soil Test",
    "Others"
  ];
}


function isAllowedProjectServiceFolder_(folderName) {
  const target = String(folderName || "").trim();

  return getProjectServiceFolderNames_()
    .includes(target);
}


function getProjectServiceFolderObjects_(projectId) {
  const drive =
    ensureProjectDriveStructure(
      projectId
    );

  const folders = [];

  getProjectServiceFolderNames_()
    .forEach(
      folderName => {

        const folder =
          drive.serviceFolders &&
          drive.serviceFolders[folderName]
            ? drive.serviceFolders[folderName]
            : getOrCreateChildFolder(
                drive.projectFolder,
                folderName
              );

        folders.push({
          name: folderName,
          id: folder.getId(),
          url: folder.getUrl(),
          folder: folder
        });

      }
    );

  return {
    drive: drive,
    folders: folders
  };
}


function getProjectServiceFolders(params) {

  const session =
    requireSession(
      params
    );

  const projectId =
    String(
      params.projectId ||
      params.Project_ID ||
      ""
    ).trim();

  assertProjectAccess(
    session,
    projectId
  );

  const result =
    getProjectServiceFolderObjects_(
      projectId
    );

  return {
    success: true,
    data: {
      projectId: projectId,
      projectFolderId:
        result.drive.projectFolder.getId(),
      projectFolderUrl:
        result.drive.projectFolder.getUrl(),
      folders:
        result.folders.map(
          item => ({
            name: item.name,
            id: item.id,
            url: item.url
          })
        )
    }
  };

}


function isPortfolioExteriorImage_(
  folderName,
  fileName,
  mimeType
) {

  if (
    String(folderName || "").trim() !==
    "3D Design - Exterior"
  ) {
    return false;
  }

  const name =
    String(fileName || "")
      .toLowerCase();

  const mime =
    String(mimeType || "")
      .toLowerCase();

  return (
    /\.(jpe?g|png|webp)$/i.test(name) ||
    /image\/(jpeg|jpg|png|webp)/i.test(mime)
  );

}


function uploadProjectServiceFile(params) {

  const session =
    requireSession(
      params
    );

  if (
    !isAdminRole(
      session.role
    )
  ) {
    throw new Error(
      "Access denied."
    );
  }

  const projectId =
    String(
      params.projectId ||
      params.Project_ID ||
      ""
    ).trim();

  const folderName =
    String(
      params.folderName ||
      params.Folder_Name ||
      ""
    ).trim();

  const fileName =
    String(
      params.fileName ||
      params.File_Name ||
      ""
    ).trim();

  const mimeType =
    String(
      params.mimeType ||
      params.Mime_Type ||
      "application/octet-stream"
    ).trim();

  const base64 =
    String(
      params.base64 ||
      params.fileBase64 ||
      ""
    ).trim();


  if (!projectId) {
    throw new Error(
      "Project ID is required."
    );
  }

  if (
    !isAllowedProjectServiceFolder_(
      folderName
    )
  ) {
    throw new Error(
      "Invalid project service folder."
    );
  }

  if (!fileName) {
    throw new Error(
      "File name is required."
    );
  }

  if (!base64) {
    throw new Error(
      "File data is required."
    );
  }


  assertProjectAccess(
    session,
    projectId
  );


  const result =
    getProjectServiceFolderObjects_(
      projectId
    );

  const target =
    result.folders.find(
      item =>
        item.name === folderName
    );


  if (!target) {
    throw new Error(
      "Project service folder not found."
    );
  }


  let bytes;

  try {

    bytes =
      Utilities.base64Decode(
        base64
      );

  } catch (error) {

    throw new Error(
      "Invalid file data."
    );

  }


  const safeFileName =
    sanitizeFileName(
      fileName
    ) ||
    "LAND VIEW File";


  const blob =
    Utilities.newBlob(
      bytes,
      mimeType ||
      "application/octet-stream",
      safeFileName
    );


  const file =
    target.folder
      .createFile(
        blob
      );


  /*
   * Exterior render images are used automatically by the
   * public project portfolio. Make them readable by link.
   */
  if (
    isPortfolioExteriorImage_(
      folderName,
      safeFileName,
      mimeType
    )
  ) {

    try {

      file.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
      );

    } catch (error) {

      /*
       * Some Google Workspace policies may block link sharing.
       * The upload itself remains successful.
       */

    }

  }


  /*
   * Also register the Drive file in Documents when that
   * sheet contains the matching columns.
   */
  try {

    appendRecord(
      CONFIG.SHEETS.DOCUMENTS,
      {
        Project_ID:
          projectId,
        Document_Name:
          safeFileName,
        Document_Type:
          folderName,
        Document_Date:
          new Date(),
        File_URL:
          file.getUrl(),
        Folder_ID:
          target.id,
        Folder_URL:
          target.url,
        Client_Visible:
          "FALSE"
      },
      "DOC-",
      "Document_ID"
    );

  } catch (error) {
    // The Drive upload succeeded. Do not delete the file merely
    // because an optional Documents-sheet column is unavailable.
  }


  return {
    success: true,
    data: {
      projectId:
        projectId,
      folderName:
        folderName,
      folderId:
        target.id,
      folderUrl:
        target.url,
      fileId:
        file.getId(),
      fileName:
        file.getName(),
      fileUrl:
        file.getUrl(),
      size:
        bytes.length
    }
  };

}


/*
 * Optional one-time migration for existing projects.
 * Run manually from Apps Script if you want all eleven
 * service folders created immediately for every old project.
 */
function initializeProjectServiceFolders() {

  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );

  const results = [];

  projects.forEach(
    project => {

      const projectId =
        getProjectIdValue(
          project
        );

      if (!projectId) {
        return;
      }

      try {

        const service =
          getProjectServiceFolderObjects_(
            projectId
          );

        results.push({
          projectId:
            projectId,
          success:
            true,
          folders:
            service.folders.length
        });

      } catch (error) {

        results.push({
          projectId:
            projectId,
          success:
            false,
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        });

      }

    }
  );

  return results;

}


/* =========================================================
   DRIVE — BULK INITIALIZATION / MIGRATION
========================================================= */

function syncProjectDriveFolders(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return syncAllProjectDriveFolders_();

}


/*
 * Run this ONCE directly from the Apps Script editor after
 * deploying this upgraded Code.gs if you want every existing
 * project folder created immediately.
 *
 * It does not require a web-app session because it is intended
 * for manual execution by the Apps Script owner.
 */
function initializeProjectDriveFolders() {

  return syncAllProjectDriveFolders_();

}


function syncAllProjectDriveFolders_() {

  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const results = [];
  let createdOrLinked = 0;
  let failed = 0;


  projects.forEach(
    project => {

      const projectId =
        getProjectIdValue(
          project
        );


      if (!projectId) {
        return;
      }


      try {

        const drive =
          ensureProjectDriveStructure(
            project
          );


        createdOrLinked++;

        results.push({
          projectId: projectId,
          success: true,
          projectFolderId:
            drive.projectFolder.getId(),
          projectFolderUrl:
            drive.projectFolder.getUrl(),
          documentsFolderId:
            drive.documentsFolder.getId(),
          documentsFolderUrl:
            drive.documentsFolder.getUrl(),
          invoicesFolderId:
            drive.invoicesFolder.getId(),
          invoicesFolderUrl:
            drive.invoicesFolder.getUrl()
        });

      } catch (error) {

        failed++;

        results.push({
          projectId: projectId,
          success: false,
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        });

      }

    }
  );


  return {
    success:
      failed === 0,

    data: {
      rootFolderId:
        getLandViewRootFolder().getId(),
      projectCount:
        projects.length,
      synced:
        createdOrLinked,
      failed:
        failed,
      results:
        results
    }
  };

}


/* =========================================================
   PUBLIC PROJECT PORTFOLIO
========================================================= */

/*
 * Project images are sourced ONLY from:
 *
 *   3D Design - Exterior
 *
 * Naming:
 *   front.jpeg / front.jpg / front.png / front.webp
 *     -> cover image
 *
 *   all other JPG/JPEG/PNG/WEBP images
 *     -> gallery
 *
 * Cover_Image_URL and Gallery_Images are intentionally
 * not required and are ignored by this backend.
 */

function ensureProjectPublicHeaders_() {

  return ensureHeaders_(
    getSheet(
      CONFIG.SHEETS.PROJECTS
    ),
    [
      "Public_Display",
      "Public_Project_Title",
      "Public_Description",
      "Project_Category",
      "Project_Area",
      "Number_of_Stories",
      "Public_Services",
      "Completion_Year",
      "Public_Display_Order"
    ]
  );

}


function initializePublicProjectPortfolio() {

  const headers =
    ensureProjectPublicHeaders_();

  return {
    success: true,
    data: {
      initialized: true,
      headers: headers
    }
  };

}


function splitPublicList_(value) {

  return String(
    value || ""
  )
    .split(
      /\r?\n|\s*[•|]\s*/
    )
    .map(
      function(item) {
        return String(
          item || ""
        ).trim();
      }
    )
    .filter(Boolean);

}


function isPublicProjectImageFile_(file) {

  const name =
    String(
      file.getName() || ""
    ).toLowerCase();

  const mime =
    String(
      file.getMimeType() || ""
    ).toLowerCase();

  return (
    mime.indexOf("image/") === 0 &&
    (
      /\.(jpe?g|png|webp)$/i.test(name) ||
      /image\/(jpeg|jpg|png|webp)/i.test(mime)
    )
  );

}


function projectDriveImageUrl_(file) {

  return (
    "https://drive.google.com/file/d/" +
    file.getId() +
    "/view"
  );

}


function makePublicProjectImageReadable_(file) {

  try {

    file.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );

  } catch (error) {

    /*
     * Do not break the public-project API when a Google
     * Workspace sharing policy prevents link sharing.
     */

  }

}


function getExteriorPublicImages_(project) {

  try {

    const rootFolder =
      getLandViewRootFolder();

    const projectFolder =
      findExistingProjectFolder(
        rootFolder,
        project
      );

    if (!projectFolder) {

      return {
        coverImageUrl: "",
        galleryImages: []
      };

    }


    const folders =
      projectFolder
        .getFoldersByName(
          "3D Design - Exterior"
        );


    if (!folders.hasNext()) {

      return {
        coverImageUrl: "",
        galleryImages: []
      };

    }


    const exteriorFolder =
      folders.next();

    const files =
      exteriorFolder.getFiles();

    const images = [];


    while (files.hasNext()) {

      const file =
        files.next();

      if (
        !isPublicProjectImageFile_(
          file
        )
      ) {
        continue;
      }


      makePublicProjectImageReadable_(
        file
      );


      images.push({
        name:
          String(
            file.getName() || ""
          ),
        lowerName:
          String(
            file.getName() || ""
          ).toLowerCase(),
        url:
          projectDriveImageUrl_(
            file
          )
      });

    }


    if (!images.length) {

      return {
        coverImageUrl: "",
        galleryImages: []
      };

    }


    images.sort(
      function(a, b) {

        return a.name.localeCompare(
          b.name,
          undefined,
          {
            numeric: true,
            sensitivity: "base"
          }
        );

      }
    );


    /*
     * Prefer front.jpeg / front.jpg / front.png / front.webp.
     * If none exists, the first image becomes the cover.
     */
    const frontIndex =
      images.findIndex(
        function(image) {

          return /^front\.(jpe?g|png|webp)$/i
            .test(
              image.lowerName
            );

        }
      );


    const cover =
      frontIndex >= 0
        ? images[frontIndex]
        : images[0];


    const gallery =
      images
        .filter(
          function(image) {
            return (
              image.url !==
              cover.url
            );
          }
        )
        .map(
          function(image) {
            return image.url;
          }
        );


    return {
      coverImageUrl:
        cover.url,
      galleryImages:
        gallery
    };


  } catch (error) {

    return {
      coverImageUrl: "",
      galleryImages: []
    };

  }

}


function getPublicProjects(params) {

  ensureProjectPublicHeaders_();


  const rows =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const publicRows =
    rows
      .filter(
        function(project) {

          const visible =
            normalize(
              firstValue(
                project,
                [
                  "Public_Display",
                  "Public Display",
                  "Show_Publicly",
                  "Show Publicly"
                ]
              )
            );

          return (
            visible === "true" ||
            visible === "yes" ||
            visible === "1"
          );

        }
      )
      .map(
        function(project) {

          const exteriorImages =
            getExteriorPublicImages_(
              project
            );


          return {

            projectId:
              firstValue(
                project,
                [
                  "Project_ID",
                  "Project ID",
                  "ProjectId"
                ]
              ),

            title:
              firstValue(
                project,
                [
                  "Public_Project_Title",
                  "Public Project Title",
                  "Project_Name",
                  "Project Name",
                  "Name"
                ]
              ),

            category:
              firstValue(
                project,
                [
                  "Project_Category",
                  "Project Category",
                  "Project_Type",
                  "Project Type"
                ]
              ),

            location:
              firstValue(
                project,
                [
                  "Location",
                  "Project_Location",
                  "Project Location"
                ]
              ),

            status:
              firstValue(
                project,
                [
                  "Status",
                  "status"
                ]
              ),

            area:
              firstValue(
                project,
                [
                  "Project_Area",
                  "Project Area",
                  "Land_Area",
                  "Land Area"
                ]
              ),

            stories:
              firstValue(
                project,
                [
                  "Number_of_Stories",
                  "Number of Stories",
                  "Floor_Story",
                  "Floor/Story",
                  "Floors"
                ]
              ),

            completionYear:
              firstValue(
                project,
                [
                  "Completion_Year",
                  "Completion Year"
                ]
              ),

            description:
              firstValue(
                project,
                [
                  "Public_Description",
                  "Public Description"
                ]
              ),

            coverImageUrl:
              exteriorImages
                .coverImageUrl,

            galleryImages:
              exteriorImages
                .galleryImages,

            services:
              splitPublicList_(
                firstValue(
                  project,
                  [
                    "Public_Services",
                    "Public Services",
                    "Services"
                  ]
                )
              ),

            displayOrder:
              Number(
                firstValue(
                  project,
                  [
                    "Public_Display_Order",
                    "Public Display Order"
                  ]
                ) ||
                9999
              )

          };

        }
      )
      .sort(
        function(a, b) {

          return (
            a.displayOrder -
            b.displayOrder
            ||
            String(
              a.title || ""
            ).localeCompare(
              String(
                b.title || ""
              )
            )
          );

        }
      );


  return {
    success: true,
    data:
      publicRows
  };

}


/* =========================================================
   EMPLOYEES
========================================================= */

function ensureEmployeePublicHeaders_() {
  return ensureHeaders_(getSheet(CONFIG.SHEETS.EMPLOYEES), [
    "Public_Display",
    "Public_Title",
    "Public_Bio",
    "Photo_URL",
    "LinkedIn_URL",
    "Display_Order"
  ]);
}

function getPublicTeam(params) {
  ensureEmployeePublicHeaders_();

  const rows = readSheet(CONFIG.SHEETS.EMPLOYEES);
  const publicRows = rows
    .filter(function(employee) {
      const visible = normalize(firstValue(employee, ["Public_Display", "Public Display", "Show_Publicly", "Show Publicly"]));
      const status = normalize(firstValue(employee, ["Status", "status"]));
      return (visible === "true" || visible === "yes" || visible === "1") && (!status || status === "active");
    })
    .map(function(employee) {
      return {
        name: firstValue(employee, ["Employee_Name", "Employee Name", "Name"]),
        title: firstValue(employee, ["Public_Title", "Public Title", "Position", "Designation"]),
        department: firstValue(employee, ["Department", "department"]),
        bio: firstValue(employee, ["Public_Bio", "Public Bio", "Bio"]),
        photoUrl: firstValue(employee, ["Photo_URL", "Photo URL", "Photo"]),
        linkedInUrl: firstValue(employee, ["LinkedIn_URL", "LinkedIn URL", "LinkedIn"]),
        displayOrder: Number(firstValue(employee, ["Display_Order", "Display Order"]) || 9999)
      };
    })
    .sort(function(a, b) { return a.displayOrder - b.displayOrder || String(a.name || "").localeCompare(String(b.name || "")); });

  return { success: true, data: publicRows };
}

function getEmployees(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return {
    success: true,

    data:
      readSheet(
        CONFIG.SHEETS.EMPLOYEES
      )
  };

}


function createEmployee(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  ensureEmployeePublicHeaders_();

  const employee =
    Object.assign({}, params);

  delete employee.action;
  delete employee.token;
  delete employee.proxySecret;


  const sheet =
    getSheet(
      CONFIG.SHEETS.EMPLOYEES
    );


  const headers =
    getHeaders(sheet);


  if (!employee.Employee_ID) {

    employee.Employee_ID =
      generateId(
        "EMP-",
        sheet,
        "Employee_ID"
      );

  }


  sheet.appendRow(
    headers.map(
      h =>
        employee[h] ?? ""
    )
  );

  const account = ensureEmployeeLoginAccount_(employee);

  return {
    success: true,
    data: Object.assign({}, employee, { employee: employee, account: account })
  };

}


function updateEmployee(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  ensureEmployeePublicHeaders_();

  return updateGeneric(
    CONFIG.SHEETS.EMPLOYEES,
    params,
    [
      "Employee_ID",
      "Employee ID",
      "EmployeeId"
    ],
    params.employeeId
  );

}


function deleteEmployee(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return deleteGeneric(
    CONFIG.SHEETS.EMPLOYEES,
    [
      "Employee_ID",
      "Employee ID",
      "EmployeeId"
    ],
    params.employeeId
  );

}


/* =========================================================
   DOCUMENTS
========================================================= */

function getDocuments(params) {
  const session = requireSession(params);
  let data = readSheet(CONFIG.SHEETS.DOCUMENTS);

  if (params.projectId) {
    assertProjectAccess(session, params.projectId);
    data = filterByProject(data, params.projectId);
  } else {
    data = scopeProjectRecordsForSession(session, data);
  }

  if (normalizeRoleName(session.role) === "client") {
    data = data.filter(isClientVisible).map(sanitizeDocumentForClient);
  }

  return { success: true, data: data };
}


function createDocument(params) {
  const session = requireSession(params);
  const document = cleanParams(params);
  const projectId = String(document.Project_ID || document.projectId || "").trim();
  assertProjectAccess(session, projectId);

  if (projectId) {
    const drive = ensureProjectDriveStructure(projectId);
    document.Document_Folder_ID = drive.documentsFolder.getId();
    document.Document_Folder_URL = drive.documentsFolder.getUrl();
  }

  return appendRecord(CONFIG.SHEETS.DOCUMENTS, document, "DOC-", "Document_ID");
}


/* =========================================================
   SITE VISITS
========================================================= */

function getSiteVisits(params) {
  const session = requireSession(params);
  let data = readSheet(CONFIG.SHEETS.SITE_VISITS);

  if (params.projectId) {
    assertProjectAccess(session, params.projectId);
    data = filterByProject(data, params.projectId);
  } else {
    data = scopeProjectRecordsForSession(session, data);
  }

  return { success: true, data: data };
}


function createSiteVisit(params) {
  const session = requireSession(params);
  const visit = cleanParams(params);
  const projectId = String(visit.Project_ID || visit.projectId || "").trim();
  assertProjectAccess(session, projectId);
  return appendRecord(CONFIG.SHEETS.SITE_VISITS, visit, "SV-", "Visit_ID");
}


/* =========================================================
   BILLING
========================================================= */

function getBillingDashboard(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");


  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const bills =
    readSheet(
      CONFIG.SHEETS.BILLS
    );


  const payments =
    readSheet(
      CONFIG.SHEETS.PAYMENTS
    );


  let totalBill = 0;
  let totalPaid = 0;


  bills.forEach(
    bill => {

      totalBill +=
        toNumber(
          firstValue(
            bill,
            [
              "Amount",
              "Total",
              "Bill_Amount",
              "Grand_Total"
            ]
          )
        );

    }
  );


  payments.forEach(
    payment => {

      totalPaid +=
        toNumber(
          firstValue(
            payment,
            [
              "Amount",
              "Payment_Amount"
            ]
          )
        );

    }
  );


  return {
    success: true,

    data: {
      projectCount:
        projects.length,

      billCount:
        bills.length,

      paymentCount:
        payments.length,

      totalBill:
        totalBill,

      totalPaid:
        totalPaid,

      pending:
        totalBill - totalPaid
    }
  };

}


function getProjectBilling(params) {
  const session = requireSession(params);
  const projectId = String(params.projectId || "").trim();
  assertProjectAccess(session, projectId);

  let bills = filterByProject(readSheet(CONFIG.SHEETS.BILLS), projectId);
  let payments = filterByProject(readSheet(CONFIG.SHEETS.PAYMENTS), projectId);
  const totalBill = sumAmount(bills);
  const totalPaid = sumAmount(payments);

  if (normalizeRoleName(session.role) === "client") {
    bills = bills.map(record => sanitizeBillingRecordForClient(record, "bill"));
    payments = payments.map(record => sanitizeBillingRecordForClient(record, "payment"));
  }

  return {
    success: true,
    data: { projectId, bills, payments, totalBill, totalPaid, due: totalBill - totalPaid }
  };
}


function getBillingRecords(params) {
  const session = requireSession(params);
  const projectId = String(params.projectId || "").trim();
  assertProjectAccess(session, projectId);

  const category = String(params.category || "").toLowerCase();
  const isPayment = category.includes("payment");
  const sheetName = isPayment ? CONFIG.SHEETS.PAYMENTS : CONFIG.SHEETS.BILLS;
  let records = filterByProject(readSheet(sheetName), projectId);

  if (normalizeRoleName(session.role) === "client") {
    records = records.map(record => sanitizeBillingRecordForClient(record, isPayment ? "payment" : "bill"));
  }

  return { success: true, data: records };
}


/* =========================================================
   BILLS
========================================================= */

function saveBill(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.BILLS,
    cleanParams(params),
    "BILL-",
    "Bill_ID"
  );

}


function createBill(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.BILLS,
    cleanParams(params),
    "BILL-",
    "Bill_ID"
  );

}


/* =========================================================
   PAYMENTS
========================================================= */

function getPayments(params) {
  const session = requireSession(params);
  let payments = readSheet(CONFIG.SHEETS.PAYMENTS);

  if (params.projectId) {
    assertProjectAccess(session, params.projectId);
    payments = filterByProject(payments, params.projectId);
  } else {
    payments = scopeProjectRecordsForSession(session, payments);
  }

  if (normalizeRoleName(session.role) === "client") {
    payments = payments.map(record => sanitizeBillingRecordForClient(record, "payment"));
  }

  return { success: true, data: payments };
}


function savePayment(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    cleanParams(params),
    "PAY-",
    "Payment_ID"
  );

}


function createPayment(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    cleanParams(params),
    "PAY-",
    "Payment_ID"
  );

}


/* =========================================================
   INVOICES
========================================================= */

function getInvoices(params) {
  const session = requireSession(params);
  let invoices = readSheet(CONFIG.SHEETS.INVOICES);

  if (params.projectId) {
    assertProjectAccess(session, params.projectId);
    invoices = filterByProject(invoices, params.projectId);
  } else {
    invoices = scopeProjectRecordsForSession(session, invoices);
  }

  if (normalizeRoleName(session.role) === "client") {
    invoices = invoices.map(sanitizeInvoiceForClient);
  }

  return { success: true, data: invoices };
}


function createInvoice(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  const projectId =
    String(
      params.projectId ||
      params.Project_ID ||
      ""
    ).trim();


  if (!projectId) {

    throw new Error(
      "Project ID is required."
    );

  }


  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const project =
    projects.find(
      item =>
        String(
          firstValue(
            item,
            [
              "Project_ID",
              "Project ID",
              "ProjectId"
            ]
          ) || ""
        ).trim() === projectId
    );


  if (!project) {

    throw new Error(
      "Project not found."
    );

  }


  const bills =
    filterByProject(
      readSheet(
        CONFIG.SHEETS.BILLS
      ),
      projectId
    );


  const payments =
    filterByProject(
      readSheet(
        CONFIG.SHEETS.PAYMENTS
      ),
      projectId
    );


  const totalBill =
    sumAmount(
      bills
    );


  const totalPaid =
    sumAmount(
      payments
    );


  const due =
    totalBill - totalPaid;


  const invoiceSheet =
    getSheet(
      CONFIG.SHEETS.INVOICES
    );


  ensureInvoiceHeaders(
    invoiceSheet
  );


  const invoiceId =
    generateId(
      "INV-",
      invoiceSheet,
      "Invoice_ID"
    );


  const invoiceDate =
    new Date();


  const projectName =
    String(
      firstValue(
        project,
        [
          "Project_Name",
          "Project Name",
          "Name"
        ]
      ) || projectId
    );


  const clientName =
    String(
      firstValue(
        project,
        [
          "Client_Name",
          "Client Name",
          "Client"
        ]
      ) || ""
    );


  const drive =
    ensureProjectDriveStructure(
      project
    );


  const invoicesFolder =
    drive.invoicesFolder;


  const pdfFile =
    createInvoicePdfFile({
      invoiceId: invoiceId,
      invoiceDate: invoiceDate,
      projectId: projectId,
      project: project,
      projectName: projectName,
      clientName: clientName,
      bills: bills,
      payments: payments,
      totalBill: totalBill,
      totalPaid: totalPaid,
      due: due,
      folder: invoicesFolder
    });


  const pdfUrl =
    pdfFile.getUrl();


  const downloadUrl =
    "https://drive.google.com/uc?export=download&id=" +
    pdfFile.getId();


  const invoice = {

    Invoice_ID:
      invoiceId,

    Project_ID:
      projectId,

    Project_Name:
      projectName,

    Client_Name:
      clientName,

    Invoice_Date:
      invoiceDate,

    Status:
      "Generated",

    Total_Bill:
      totalBill,

    Total_Paid:
      totalPaid,

    Due_Amount:
      due,

    PDF_File_ID:
      pdfFile.getId(),

    PDF_URL:
      pdfUrl,

    Download_URL:
      downloadUrl,

    Invoice_Folder_URL:
      invoicesFolder.getUrl(),

    Notes:
      String(
        params.notes ||
        params.Notes ||
        ""
      )

  };


  appendRecord(
    CONFIG.SHEETS.INVOICES,
    invoice,
    "INV-",
    "Invoice_ID"
  );


  return {

    success: true,

    data: {
      invoiceId: invoiceId,
      projectId: projectId,
      projectName: projectName,
      clientName: clientName,
      totalBill: totalBill,
      totalPaid: totalPaid,
      due: due,
      fileId: pdfFile.getId(),
      pdfUrl: pdfUrl,
      downloadUrl: downloadUrl,
      folderUrl: invoicesFolder.getUrl(),
      invoice: invoice
    }

  };

}


/* =========================================================
   INVOICE PDF HELPERS
========================================================= */

function ensureInvoiceHeaders(sheet) {

  const requiredHeaders = [
    "Invoice_ID",
    "Project_ID",
    "Project_Name",
    "Client_Name",
    "Invoice_Date",
    "Status",
    "Total_Bill",
    "Total_Paid",
    "Due_Amount",
    "PDF_File_ID",
    "PDF_URL",
    "Download_URL",
    "Invoice_Folder_URL",
    "Notes"
  ];


  let headers =
    getHeaders(
      sheet
    );


  requiredHeaders.forEach(
    header => {

      if (
        findHeaderIndex(
          headers,
          [header]
        ) < 0
      ) {

        sheet
          .getRange(
            1,
            headers.length + 1
          )
          .setValue(
            header
          );

        headers.push(
          header
        );

      }

    }
  );


  return headers;

}


function getInvoiceProjectFolder(project) {

  /*
   * Backward-compatible helper retained for older callers.
   * Folder creation is now centralized in the automatic
   * project Drive structure.
   */
  return ensureProjectDriveStructure(
    project
  ).projectFolder;

}


function extractDriveFolderId(value) {

  const text =
    String(
      value || ""
    );


  const folderMatch =
    text.match(
      /\/folders\/([a-zA-Z0-9_-]+)/
    );


  if (
    folderMatch &&
    folderMatch[1]
  ) {

    return folderMatch[1];

  }


  const idMatch =
    text.match(
      /[-\w]{20,}/
    );


  return idMatch
    ? idMatch[0]
    : "";

}


function getOrCreateChildFolder(
  parentFolder,
  name
) {

  const folders =
    parentFolder
      .getFoldersByName(
        name
      );


  if (
    folders.hasNext()
  ) {

    return folders.next();

  }


  return parentFolder
    .createFolder(
      name
    );

}


function createInvoicePdfFile(options) {

  const safeProjectName =
    sanitizeFileName(
      options.projectName ||
      options.projectId
    );

  const fileName =
    options.invoiceId +
    " - " +
    safeProjectName +
    ".pdf";

  const tempSpreadsheet =
    SpreadsheetApp.create(
      "TEMP - " +
      options.invoiceId +
      " - LAND VIEW Invoice"
    );

  const tempFile =
    DriveApp.getFileById(
      tempSpreadsheet.getId()
    );

  try {

    const sheet =
      tempSpreadsheet
        .getSheets()[0];

    sheet.setName(
      "Invoice"
    );

    buildReferenceInvoiceSheet(
      sheet,
      options
    );

    SpreadsheetApp.flush();
    Utilities.sleep(900);

    const pdfBlob =
      exportInvoiceSheetAsPdf(
        tempSpreadsheet,
        sheet,
        fileName
      );

    return options.folder
      .createFile(
        pdfBlob
      );

  } finally {

    try {
      tempFile.setTrashed(true);
    } catch (ignore) {
      // Ignore cleanup failure.
    }

  }

}


function buildReferenceInvoiceSheet(
  sheet,
  options
) {

  const NAVY = "#0F2945";
  const NAVY_2 = "#06243A";
  const ORANGE = "#FF9E16";
  const YELLOW = "#FFC400";
  const CREAM = "#FBE2AF";
  const WHITE = "#FFFFFF";
  const BLACK = "#000000";
  const RED = "#C00000";

  sheet.clear();
  sheet.setHiddenGridlines(true);

  // Six-column canvas approximating the supplied invoice proportions.
  [52, 185, 88, 82, 82, 95].forEach(
    function(width, index) {
      sheet.setColumnWidth(
        index + 1,
        width
      );
    }
  );

  for (
    let row = 1;
    row <= 42;
    row++
  ) {
    sheet.setRowHeight(row, 21);
  }

  sheet.setRowHeights(1, 6, 24);
  sheet.setRowHeight(1, 33);
  sheet.setRowHeight(2, 29);
  sheet.setRowHeight(3, 26);
  sheet.setRowHeight(4, 22);
  sheet.setRowHeight(5, 22);
  sheet.setRowHeight(6, 23);

  const project = options.project || {};

  const ownerName =
    String(
      firstValue(
        project,
        [
          "Client_Name",
          "Client Name",
          "Owner_Name",
          "Owner Name",
          "Client"
        ]
      ) || options.clientName || "—"
    );

  const ownerAddress =
    String(
      firstValue(
        project,
        [
          "Client_Address",
          "Client Address",
          "Owner_Address",
          "Owner Address",
          "Address",
          "Location"
        ]
      ) || "—"
    );

  const ownerContact =
    String(
      firstValue(
        project,
        [
          "Phone_Number",
          "Phone Number",
          "Phone",
          "Contact",
          "Mobile"
        ]
      ) || "—"
    );

  const floorStory =
    String(
      firstValue(
        project,
        [
          "Floor_Story",
          "Floor/Story",
          "Floors",
          "Floor",
          "Story",
          "No_of_Floors",
          "No. of Floors"
        ]
      ) || "—"
    );

  const buildType =
    String(
      firstValue(
        project,
        [
          "Build_Type",
          "Build Type",
          "Building_Type",
          "Building Type",
          "Project_Type",
          "Project Type"
        ]
      ) || "—"
    );

  const landArea =
    String(
      firstValue(
        project,
        [
          "Land_Area",
          "Land Area",
          "Plot_Area",
          "Plot Area"
        ]
      ) || "—"
    );

  // -------------------------------------------------------
  // HEADER
  // -------------------------------------------------------

  sheet.getRange("A1:F6")
    .setBackground(NAVY)
    .setFontColor(WHITE)
    .setFontFamily("Arial");

  // Orange diagonal-like visual accent using blocks.
  sheet.getRange("C1:C5").setBackground(ORANGE);
  sheet.getRange("D1:D3").setBackground("#634F55");
  sheet.getRange("C6:F6").setBackground(WHITE);
  sheet.getRange("C6:F6").setBorder(
    false, false, true, false, false, false,
    ORANGE,
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  sheet.getRange("D1:F1")
    .merge()
    .setValue("INVOICE")
    .setFontSize(25)
    .setFontWeight("bold")
    .setFontColor(ORANGE)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("D2:F2")
    .merge()
    .setValue(CONFIG.INVOICE.TITLE)
    .setFontSize(21)
    .setFontWeight("bold")
    .setFontColor(WHITE)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("D3:F3")
    .merge()
    .setValue(CONFIG.INVOICE.SUBTITLE)
    .setFontSize(9)
    .setFontWeight("bold")
    .setFontColor(WHITE)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("D4:F5")
    .merge()
    .setValue(CONFIG.INVOICE.BILL_LABEL)
    .setFontSize(13)
    .setFontWeight("bold")
    .setFontColor(BLACK)
    .setBackground(YELLOW)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  insertInvoiceLogo(sheet);

  // -------------------------------------------------------
  // FILE ID / DATE
  // -------------------------------------------------------

  sheet.getRange("A7:F7")
    .setFontFamily("Times New Roman")
    .setFontSize(10)
    .setFontWeight("bold")
    .setVerticalAlignment("middle");

  sheet.getRange("A7")
    .setValue("File ID:")
    .setBackground(NAVY_2)
    .setFontColor(WHITE);

  sheet.getRange("B7:C7")
    .merge()
    .setValue(options.projectId)
    .setHorizontalAlignment("center")
    .setBackground(WHITE);

  sheet.getRange("D7")
    .setValue("Issue Date")
    .setBackground(NAVY_2)
    .setFontColor(WHITE)
    .setHorizontalAlignment("center");

  sheet.getRange("E7:F7")
    .merge()
    .setValue(formatInvoiceDateShort(options.invoiceDate))
    .setHorizontalAlignment("center")
    .setBackground(WHITE);

  sheet.getRange("A7:F7").setBorder(
    true, true, true, true, true, true,
    BLACK,
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  // -------------------------------------------------------
  // OWNER / BUILDING DETAILS
  // -------------------------------------------------------

  sheet.getRange("A9:C9")
    .merge()
    .setValue("Owner Details")
    .setBackground(NAVY_2)
    .setFontColor(WHITE)
    .setFontWeight("bold")
    .setFontSize(11)
    .setHorizontalAlignment("center");

  sheet.getRange("D9:F9")
    .merge()
    .setValue("Building Details")
    .setBackground(NAVY_2)
    .setFontColor(WHITE)
    .setFontWeight("bold")
    .setFontSize(11)
    .setHorizontalAlignment("center");

  const detailRows = [
    ["Name:", ownerName, "Floor/Story:", floorStory],
    ["Address:", ownerAddress, "Build Type:", buildType],
    ["Contact:", ownerContact, "Land Area:", landArea]
  ];

  for (
    let i = 0;
    i < detailRows.length;
    i++
  ) {

    const r = 10 + i;

    sheet.getRange(r, 1)
      .setValue(detailRows[i][0])
      .setFontWeight("bold");

    sheet.getRange(r, 2, 1, 2)
      .merge()
      .setValue(detailRows[i][1]);

    sheet.getRange(r, 4)
      .setValue(detailRows[i][2])
      .setFontWeight("bold");

    sheet.getRange(r, 5, 1, 2)
      .merge()
      .setValue(detailRows[i][3]);

    sheet.getRange(r, 1, 1, 6)
      .setFontFamily("Times New Roman")
      .setFontSize(10)
      .setVerticalAlignment("middle")
      .setBorder(
        true, true, true, true, true, true,
        BLACK,
        SpreadsheetApp.BorderStyle.SOLID
      );

  }

  // -------------------------------------------------------
  // ENGINEERING SERVICE TABLE
  // -------------------------------------------------------

  const tableHeaderRow = 14;

  sheet.getRange(tableHeaderRow, 1, 1, 6)
    .setBackground(NAVY_2)
    .setFontColor(WHITE)
    .setFontWeight("bold")
    .setFontFamily("Times New Roman")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setValues([[
      "SL No.",
      "Engineering Services",
      "Price",
      "Qty",
      "Amount",
      "Notes"
    ]])
    .setBorder(
      true, true, true, true, true, true,
      BLACK,
      SpreadsheetApp.BorderStyle.SOLID
    );

  const maxServiceRows = 12;
  const bills = options.bills || [];
  const serviceRows = [];

  bills.slice(0, maxServiceRows).forEach(
    function(bill, index) {

      serviceRows.push([
        index + 1,
        String(
          firstValue(
            bill,
            [
              "Description",
              "Engineering_Service",
              "Engineering Service",
              "Service",
              "Particulars",
              "Item"
            ]
          ) || "Engineering Service"
        ),
        "-",
        "-",
        toNumber(
          firstValue(
            bill,
            [
              "Amount",
              "Bill_Amount",
              "Total",
              "Grand_Total"
            ]
          )
        ),
        String(
          firstValue(
            bill,
            ["Notes", "Remarks"]
          ) || ""
        )
      ]);

    }
  );

  while (
    serviceRows.length < maxServiceRows
  ) {
    serviceRows.push([
      serviceRows.length + 1,
      "-",
      "-",
      "-",
      "",
      ""
    ]);
  }

  const serviceStart = tableHeaderRow + 1;
  const serviceEnd = serviceStart + maxServiceRows - 1;

  sheet.getRange(
    serviceStart,
    1,
    maxServiceRows,
    6
  )
    .setValues(serviceRows)
    .setFontFamily("Times New Roman")
    .setFontSize(10)
    .setVerticalAlignment("middle")
    .setBorder(
      true, true, true, true, true, true,
      BLACK,
      SpreadsheetApp.BorderStyle.SOLID
    );

  for (
    let r = serviceStart;
    r <= serviceEnd;
    r++
  ) {

    if (
      (r - serviceStart) % 2 === 1
    ) {
      sheet.getRange(r, 1, 1, 6)
        .setBackground(CREAM);
    }

    sheet.getRange(r, 1)
      .setHorizontalAlignment("center")
      .setFontWeight("bold");

    sheet.getRange(r, 2)
      .setFontWeight("bold");

    sheet.getRange(r, 3, 1, 2)
      .setHorizontalAlignment("center");

    sheet.getRange(r, 5)
      .setHorizontalAlignment("right")
      .setNumberFormat("#,##0");

  }

  // -------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------

  const summaryStart = serviceEnd + 2;

  sheet.getRange(summaryStart, 1, 4, 3)
    .setBorder(
      true, true, true, true, true, true,
      BLACK,
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  sheet.getRange(summaryStart, 1, 2, 1)
    .merge()
    .setValue("Total Due\nin Words:")
    .setFontWeight("bold")
    .setFontFamily("Times New Roman")
    .setFontSize(10)
    .setWrap(true)
    .setVerticalAlignment("middle");

  sheet.getRange(summaryStart, 2, 2, 2)
    .merge()
    .setValue(numberToTakaWords(options.due))
    .setFontWeight("bold")
    .setFontFamily("Times New Roman")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.getRange(summaryStart + 2, 1, 2, 3)
    .merge()
    .setValue(
      "Electronically Generated Invoice\nNo Signature Required!"
    )
    .setFontColor(RED)
    .setFontWeight("bold")
    .setFontFamily("Times New Roman")
    .setFontSize(9)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  const summaryLabels = [
    ["BILL AMOUNT", options.totalBill],
    ["DISCOUNT", 0],
    ["DEPOSITED", options.totalPaid],
    ["BALANCE DUE", options.due]
  ];

  sheet.getRange(summaryStart, 4, 4, 3)
    .setValues(summaryLabels.map(function(item) {
      return [item[0], "", item[1]];
    }))
    .setFontFamily("Times New Roman")
    .setFontSize(10)
    .setBorder(
      true, true, true, true, true, true,
      BLACK,
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  for (
    let i = 0;
    i < summaryLabels.length;
    i++
  ) {

    const r = summaryStart + i;

    sheet.getRange(r, 4, 1, 2)
      .merge()
      .setValue(summaryLabels[i][0])
      .setBackground(i < 3 ? YELLOW : CREAM)
      .setFontWeight("bold");

    sheet.getRange(r, 6)
      .setValue(summaryLabels[i][1])
      .setNumberFormat("#,##0")
      .setHorizontalAlignment("right")
      .setFontWeight("bold");

  }

  // -------------------------------------------------------
  // FOOTER
  // -------------------------------------------------------

  const footerRow = summaryStart + 6;

  sheet.getRange(footerRow, 1, 2, 3)
    .merge()
    .setValue(
      "Thanks for your business!\n" +
      CONFIG.INVOICE.ADDRESS_LINE_1 +
      "\n" +
      CONFIG.INVOICE.ADDRESS_LINE_2
    )
    .setBackground(ORANGE)
    .setFontColor(WHITE)
    .setFontWeight("bold")
    .setFontSize(8)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.getRange(footerRow, 4, 2, 3)
    .merge()
    .setValue(
      "Email: " +
      CONFIG.INVOICE.EMAIL +
      "\nContact " +
      CONFIG.INVOICE.PHONE_1 +
      "\n" +
      CONFIG.INVOICE.PHONE_2
    )
    .setBackground(NAVY)
    .setFontColor(WHITE)
    .setFontWeight("bold")
    .setFontSize(8)
    .setHorizontalAlignment("right")
    .setVerticalAlignment("middle")
    .setWrap(true);

  // Outer print area styling.
  sheet.getRange(
    1,
    1,
    footerRow + 1,
    6
  )
    .setVerticalAlignment("middle");

}


function insertInvoiceLogo(sheet) {

  try {

    const rootFolder =
      DriveApp.getFolderById(
        CONFIG.ROOT_FOLDER_ID
      );

    const files =
      rootFolder.getFilesByName(
        CONFIG.INVOICE.LOGO_FILE_NAME
      );

    if (!files.hasNext()) {

      // Fallback text mark if logo file has not been uploaded yet.
      sheet.getRange("A1:B5")
        .merge()
        .setValue("LAND VIEW")
        .setFontColor("#FF9E16")
        .setFontWeight("bold")
        .setFontSize(17)
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle");

      return;

    }

    const logoFile = files.next();
    const image =
      sheet.insertImage(
        logoFile.getBlob(),
        1,
        1
      );

    image
      .setWidth(130)
      .setHeight(118);

  } catch (error) {

    sheet.getRange("A1:B5")
      .merge()
      .setValue("LAND VIEW")
      .setFontColor("#FF9E16")
      .setFontWeight("bold")
      .setFontSize(17)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

  }

}


function exportInvoiceSheetAsPdf(
  spreadsheet,
  sheet,
  fileName
) {

  const url =
    "https://docs.google.com/spreadsheets/d/" +
    spreadsheet.getId() +
    "/export" +
    "?format=pdf" +
    "&size=A4" +
    "&portrait=true" +
    "&fitw=true" +
    "&sheetnames=false" +
    "&printtitle=false" +
    "&pagenumbers=false" +
    "&gridlines=false" +
    "&fzr=false" +
    "&top_margin=0.15" +
    "&bottom_margin=0.15" +
    "&left_margin=0.15" +
    "&right_margin=0.15" +
    "&gid=" +
    sheet.getSheetId();

  const response =
    UrlFetchApp.fetch(
      url,
      {
        headers: {
          Authorization:
            "Bearer " +
            ScriptApp.getOAuthToken()
        },
        muteHttpExceptions: true
      }
    );

  if (
    response.getResponseCode() !== 200
  ) {
    throw new Error(
      "Invoice PDF export failed. HTTP " +
      response.getResponseCode() +
      ": " +
      response.getContentText().substring(0, 250)
    );
  }

  return response
    .getBlob()
    .setName(fileName);

}


function formatInvoiceDate(value) {

  if (!value) {
    return "—";
  }

  let date = value;

  if (
    Object.prototype.toString.call(
      value
    ) !== "[object Date]"
  ) {
    date = new Date(value);
  }

  if (
    isNaN(date.getTime())
  ) {
    return String(value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone() ||
      "Asia/Dhaka",
    "dd MMM yyyy"
  );

}


function formatInvoiceDateShort(value) {

  if (!value) {
    return "—";
  }

  let date = value;

  if (
    Object.prototype.toString.call(value) !==
    "[object Date]"
  ) {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) {
    return String(value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone() || "Asia/Dhaka",
    "dd-MMM-yy"
  );

}


function formatInvoiceMoney(value) {

  const amount = toNumber(value);

  const fixed =
    amount.toFixed(2).split(".");

  fixed[0] = fixed[0].replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );

  return "৳ " + fixed.join(".");

}


function numberToTakaWords(value) {

  let amount =
    Math.round(
      Math.abs(
        toNumber(value)
      )
    );

  if (amount === 0) {
    return "Zero Taka Only";
  }

  const ones = [
    "", "One", "Two", "Three", "Four",
    "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
    "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];

  const tens = [
    "", "", "Twenty", "Thirty", "Forty",
    "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  function belowHundred(n) {
    if (n < 20) return ones[n];
    return (
      tens[Math.floor(n / 10)] +
      (n % 10 ? " " + ones[n % 10] : "")
    );
  }

  function belowThousand(n) {
    let text = "";
    if (n >= 100) {
      text += ones[Math.floor(n / 100)] + " Hundred";
      n %= 100;
      if (n) text += " ";
    }
    if (n) text += belowHundred(n);
    return text;
  }

  const parts = [];

  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;

  const lakh = Math.floor(amount / 100000);
  amount %= 100000;

  const thousand = Math.floor(amount / 1000);
  amount %= 1000;

  if (crore) {
    parts.push(belowThousand(crore) + " Crore");
  }

  if (lakh) {
    parts.push(belowThousand(lakh) + " Lakh");
  }

  if (thousand) {
    parts.push(belowThousand(thousand) + " Thousand");
  }

  if (amount) {
    parts.push(belowThousand(amount));
  }

  return parts.join(" ") + " Taka Only";

}


function sanitizeFileName(value) {

  return String(
    value || "Invoice"
  )
    .replace(
      /[\\/:*?"<>|]+/g,
      "-"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .substring(0, 80);

}


function testInvoiceStyle() {

  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );

  if (!projects.length) {
    throw new Error(
      "No projects found. Create a project first."
    );
  }

  const projectId =
    String(
      firstValue(
        projects[0],
        [
          "Project_ID",
          "Project ID",
          "ProjectId"
        ]
      ) || ""
    ).trim();

  if (!projectId) {
    throw new Error(
      "The first project has no Project_ID."
    );
  }

  const result =
    createInvoice({
      projectId: projectId,
      token: createTemporaryAdminTestSession()
    });

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;

}


function createTemporaryAdminTestSession() {

  const users =
    readSheet(
      CONFIG.SHEETS.USERS
    );

  if (!users.length) {
    throw new Error(
      "No users found. A user is required for the invoice test."
    );
  }

  return createSession(users[0]);

}


/* =========================================================
   ERP CORE MODULES
========================================================= */

const ERP_MODULES = {
  clients: {
    sheet: "CLIENTS", id: "Client_ID", prefix: "CL-",
    headers: ["Client_ID", "Client_Name", "Phone_Number", "Email", "Address", "Client_Type", "Status", "Notes", "Created_At", "Created_By"]
  },
  tasks: {
    sheet: "TASKS", id: "Task_ID", prefix: "TASK-",
    headers: ["Task_ID", "Project_ID", "Task_Title", "Description", "Assigned_Employee_ID", "Priority", "Status", "Start_Date", "Due_Date", "Completed_At", "Created_At", "Created_By"]
  },
  attendance: {
    sheet: "ATTENDANCE", id: "Attendance_ID", prefix: "ATT-",
    headers: ["Attendance_ID", "Employee_ID", "Attendance_Date", "Check_In", "Check_Out", "Work_Hours", "Status", "Notes", "Created_At", "Created_By"]
  },
  leave: {
    sheet: "LEAVE_REQUESTS", id: "Leave_ID", prefix: "LVREQ-",
    headers: ["Leave_ID", "Employee_ID", "Leave_Type", "Start_Date", "End_Date", "Reason", "Status", "Reviewed_By", "Reviewed_At", "Created_At", "Created_By"]
  },
  expenses: {
    sheet: "EXPENSES", id: "Expense_ID", prefix: "EXP-",
    headers: ["Expense_ID", "Project_ID", "Expense_Date", "Category", "Description", "Amount", "Payment_Method", "Reference", "Status", "Created_At", "Created_By"]
  },
  quotations: {
    sheet: "QUOTATIONS", id: "Quotation_ID", prefix: "QT-",
    headers: ["Quotation_ID", "Client_ID", "Project_ID", "Quotation_Date", "Valid_Until", "Description", "Amount", "Status", "Notes", "Created_At", "Created_By"]
  },
  drawings: {
    sheet: "DRAWINGS", id: "Drawing_ID", prefix: "DWG-",
    headers: ["Drawing_ID", "Project_ID", "Drawing_Title", "Discipline", "Revision", "Assigned_Employee_ID", "Drive_URL", "Status", "Submitted_At", "Approved_At", "Approved_By", "Comments", "Created_At", "Created_By"]
  },
  approvals: {
    sheet: "APPROVALS", id: "Approval_ID", prefix: "APR-",
    headers: ["Approval_ID", "Project_ID", "Drawing_ID", "Approval_Type", "Requested_From", "Status", "Decision_Notes", "Requested_At", "Decided_At", "Created_At", "Created_By"]
  }
};

function erpModule_(name) {
  const key = normalizeRoleName(name);
  const module = ERP_MODULES[key];
  if (!module) throw new Error("Unknown ERP module: " + name);
  return module;
}

function ensureErpModule_(module) {
  ensureHeaders_(getSheet(CONFIG.SHEETS[module.sheet]), module.headers);
}

function initializeErpSheets(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  Object.keys(ERP_MODULES).forEach(function(key) { ensureErpModule_(ERP_MODULES[key]); });
  return { success: true, data: { initialized: true, modules: Object.keys(ERP_MODULES) } };
}

function filterErpRecordsForSession_(moduleName, records, session) {
  const role = normalizeRoleName(session.role);
  if (isWorkspaceRole(role)) return records;

  if (role === "employee") {
    const employeeId = String(session.employeeId || "").trim();
    if (moduleName === "tasks" || moduleName === "drawings") {
      return records.filter(function(row) { return String(row.Assigned_Employee_ID || "").trim() === employeeId; });
    }
    if (moduleName === "attendance" || moduleName === "leave") {
      return records.filter(function(row) { return String(row.Employee_ID || "").trim() === employeeId; });
    }
    return [];
  }

  if (role === "client") {
    const projectIds = splitIds(session.projectIds || "");
    if (moduleName !== "drawings" && moduleName !== "approvals") return [];
    return records.filter(function(row) { return projectIds.includes(String(row.Project_ID || "").trim()); });
  }

  return [];
}

function getErpRecords(params) {
  const session = requireSession(params);
  const moduleName = normalizeRoleName(params.module);
  const module = erpModule_(moduleName);
  ensureErpModule_(module);
  const records = readSheet(CONFIG.SHEETS[module.sheet]);
  return { success: true, data: filterErpRecordsForSession_(moduleName, records, session) };
}

function createErpRecord(params) {
  const session = requireSession(params);
  const role = normalizeRoleName(session.role);
  const moduleName = normalizeRoleName(params.module);
  const module = erpModule_(moduleName);
  const employeeModules = ["tasks", "attendance", "leave", "drawings"];
  const accountsModules = ["clients", "expenses", "quotations"];
  if (role === "accounts" && !accountsModules.includes(moduleName)) throw new Error("Access denied for accounts role.");
  if (!isWorkspaceRole(role) && !(role === "employee" && employeeModules.includes(moduleName))) {
    throw new Error("Access denied.");
  }
  ensureErpModule_(module);
  const record = cleanParams(params);
  delete record.module;
  record.Created_At = record.Created_At || new Date().toISOString();
  record.Created_By = session.userId || session.username || "";
  if (role === "employee") {
    if (moduleName === "attendance" || moduleName === "leave") record.Employee_ID = session.employeeId || "";
    if (moduleName === "tasks" || moduleName === "drawings") record.Assigned_Employee_ID = session.employeeId || "";
  }
  return appendRecord(CONFIG.SHEETS[module.sheet], record, module.prefix, module.id);
}

function updateErpRecord(params) {
  const session = requireSession(params);
  const role = normalizeRoleName(session.role);
  const moduleName = normalizeRoleName(params.module);
  const module = erpModule_(moduleName);
  ensureErpModule_(module);
  if (role === "accounts" && !["clients", "expenses", "quotations"].includes(moduleName)) throw new Error("Access denied for accounts role.");
  if (!isWorkspaceRole(role) && role !== "employee" && role !== "client") throw new Error("Access denied.");
  const visible = filterErpRecordsForSession_(moduleName, readSheet(CONFIG.SHEETS[module.sheet]), session);
  const id = String(params.id || "").trim();
  if (!isWorkspaceRole(role) && !visible.some(function(row) { return String(row[module.id] || "").trim() === id; })) {
    throw new Error("Record not found or access denied.");
  }
  const changes = cleanParams(params);
  delete changes.module;
  delete changes.id;
  if (role === "employee") {
    const allowedEmployeeFields = ["Status", "Check_In", "Check_Out", "Work_Hours", "Notes", "Drive_URL", "Comments", "Completed_At", "Submitted_At"];
    Object.keys(changes).forEach(function(key) { if (!allowedEmployeeFields.includes(key)) delete changes[key]; });
  }
  if (role === "client") {
    const allowedClientFields = ["Status", "Decision_Notes", "Decided_At"];
    Object.keys(changes).forEach(function(key) { if (!allowedClientFields.includes(key)) delete changes[key]; });
  }
  return updateGeneric(CONFIG.SHEETS[module.sheet], changes, [module.id], id);
}


/* =========================================================
   PERMISSIONS
========================================================= */

function getPermissions(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return {
    success: true,

    data:
      readSheet(
        CONFIG.SHEETS.PERMISSIONS
      )
  };

}


function createPermission(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PERMISSIONS,
    cleanParams(params),
    "PERM-",
    "Permission_ID"
  );

}


/* =========================================================
   DASHBOARD
========================================================= */

function getDashboard(params) {

  const session =
    requireSession(params);


  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const employees =
    readSheet(
      CONFIG.SHEETS.EMPLOYEES
    );


  const documents =
    readSheet(
      CONFIG.SHEETS.DOCUMENTS
    );


  const bills =
    readSheet(
      CONFIG.SHEETS.BILLS
    );


  const payments =
    readSheet(
      CONFIG.SHEETS.PAYMENTS
    );


  const activeProjects =
    projects.filter(
      p =>
        isActiveRecord(
          p
        )
    );


  const totalBill =
    sumAmount(
      bills
    );


  const totalPaid =
    sumAmount(
      payments
    );


  return {
    success: true,

    data: {

      user: {
        userId:
          session.userId,

        username:
          session.username,

        name:
          session.name,

        role:
          session.role
      },

      stats: {

        projectCount:
          projects.length,

        activeProjectCount:
          activeProjects.length,

        employeeCount:
          employees.length,

        documentCount:
          documents.length,

        totalBill:
          totalBill,

        totalPaid:
          totalPaid,

        pendingPayments:
          totalBill - totalPaid

      },

      recentProjects:
        projects.slice(
          Math.max(
            0,
            projects.length - 10
          )
        ).reverse()

    }

  };

}


/* =========================================================
   GENERIC HELPERS
========================================================= */

function getSheet(name) {

  const ss =
    getSpreadsheet();


  let sheet =
    ss.getSheetByName(
      name
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        name
      );

  }


  return sheet;

}


function getHeaders(sheet) {

  if (
    sheet.getLastColumn() === 0
  ) {
    return [];
  }


  return sheet
    .getRange(
      1,
      1,
      1,
      sheet.getLastColumn()
    )
    .getValues()[0]
    .map(
      x =>
        String(x).trim()
    );

}


function readSheet(name) {

  const sheet =
    getSheet(name);


  if (
    sheet.getLastRow() < 2 ||
    sheet.getLastColumn() < 1
  ) {

    return [];

  }


  const values =
    sheet
      .getRange(
        1,
        1,
        sheet.getLastRow(),
        sheet.getLastColumn()
      )
      .getValues();


  const headers =
    values[0].map(
      x =>
        String(x).trim()
    );


  return values
    .slice(1)
    .filter(
      row =>
        row.some(
          value =>
            value !== ""
        )
    )
    .map(
      row => {

        const object = {};

        headers.forEach(
          (header, index) => {

            object[header] =
              formatValue(
                row[index]
              );

          }
        );

        return object;

      }
    );

}


function formatValue(value) {

  if (
    Object.prototype.toString.call(
      value
    ) ===
    "[object Date]"
  ) {

    return value.toISOString();

  }


  return value;

}


function normalize(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase();

}


function firstValue(
  object,
  keys
) {

  for (
    let i = 0;
    i < keys.length;
    i++
  ) {

    if (
      Object.prototype.hasOwnProperty.call(
        object,
        keys[i]
      )
    ) {

      return object[
        keys[i]
      ];

    }

  }


  return "";

}


function isActiveUser(user) {

  const value =
    firstValue(
      user,
      [
        "Active",
        "active",
        "Status",
        "status"
      ]
    );


  /*
   * If there is no Active/Status column,
   * consider the user active.
   */

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {

    return true;

  }


  /*
   * Google Sheets may return:
   *
   * true
   * "TRUE"
   * "True"
   * yes
   * active
   * 1
   */

  if (
    value === true
  ) {

    return true;

  }


  const normalized =
    normalize(
      value
    );


  return (
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "active" ||
    normalized === "1"
  );

}


function isActiveRecord(record) {

  const value =
    firstValue(
      record,
      [
        "Active",
        "active",
        "Status",
        "status"
      ]
    );


  if (!value) {
    return true;
  }


  const v =
    normalize(value);


  return (
    v === "true" ||
    v === "yes" ||
    v === "active" ||
    v === "1" ||
    v === "ongoing"
  );

}


function findHeaderIndex(
  headers,
  names
) {

  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    if (
      names
        .map(
          x =>
            normalize(x)
        )
        .includes(
          normalize(
            headers[i]
          )
        )
    ) {

      return i;

    }

  }


  return -1;

}


function generateId(
  prefix,
  sheet,
  idHeader
) {

  const headers =
    getHeaders(sheet);


  const column =
    findHeaderIndex(
      headers,
      [idHeader]
    );


  if (column < 0) {

    return (
      prefix +
      Utilities.getUuid()
        .substring(0, 8)
        .toUpperCase()
    );

  }


  const values =
    sheet
      .getRange(
        2,
        column + 1,
        Math.max(
          1,
          sheet.getLastRow() - 1
        ),
        1
      )
      .getValues();


  let max = 0;


  values.forEach(
    row => {

      const value =
        String(
          row[0] || ""
        );


      const match =
        value.match(
          /(\d+)$/
        );


      if (match) {

        max =
          Math.max(
            max,
            Number(
              match[1]
            )
          );

      }

    }
  );


  return (
    prefix +
    String(
      max + 1
    ).padStart(
      4,
      "0"
    )
  );

}


function cleanParams(params) {

  const result = {};


  Object.keys(params)
    .forEach(
      key => {

        if (
          key !== "action" &&
          key !== "token" &&
          key !== "proxySecret"
        ) {

          result[key] =
            params[key];

        }

      }
    );


  return result;

}


function appendRecord(
  sheetName,
  record,
  prefix,
  idHeader
) {

  const sheet =
    getSheet(
      sheetName
    );


  const headers =
    getHeaders(sheet);


  if (!headers.length) {

    throw new Error(
      "Sheet " +
      sheetName +
      " must have header row."
    );

  }


  if (
    idHeader &&
    !record[idHeader]
  ) {

    record[idHeader] =
      generateId(
        prefix,
        sheet,
        idHeader
      );

  }


  const row =
    headers.map(
      h =>
        record[h] ?? ""
    );


  sheet.appendRow(
    row
  );


  return {
    success: true,

    data: {
      created: true,
      record: record
    }
  };

}


function updateGeneric(
  sheetName,
  params,
  idHeaders,
  id
) {

  const sheet =
    getSheet(
      sheetName
    );


  const headers =
    getHeaders(sheet);


  const idColumn =
    findHeaderIndex(
      headers,
      idHeaders
    );


  if (idColumn < 0) {

    throw new Error(
      "ID column not found."
    );

  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  const target =
    String(
      id || ""
    ).trim();


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(
        values[i][idColumn]
      ).trim() === target
    ) {

      Object.keys(params)
        .forEach(
          key => {

            if (
              key === "action" ||
              key === "token" ||
              key === "employeeId"
            ) {
              return;
            }


            const column =
              findHeaderIndex(
                headers,
                [key]
              );


            if (column >= 0) {

              sheet
                .getRange(
                  i + 1,
                  column + 1
                )
                .setValue(
                  params[key]
                );

            }

          }
        );


      return {
        success: true,

        data: {
          updated: true,
          id: target
        }
      };

    }

  }


  throw new Error(
    "Record not found."
  );

}


function deleteGeneric(
  sheetName,
  idHeaders,
  id
) {

  const sheet =
    getSheet(
      sheetName
    );


  const headers =
    getHeaders(sheet);


  const idColumn =
    findHeaderIndex(
      headers,
      idHeaders
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  const target =
    String(
      id || ""
    ).trim();


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(
        values[i][idColumn]
      ).trim() === target
    ) {

      sheet.deleteRow(
        i + 1
      );


      return {
        success: true,

        data: {
          deleted: true,
          id: target
        }
      };

    }

  }


  throw new Error(
    "Record not found."
  );

}


function filterByProject(
  records,
  projectId
) {

  const target =
    String(
      projectId || ""
    ).trim();


  return records.filter(
    record => {

      const value =
        firstValue(
          record,
          [
            "Project_ID",
            "Project ID",
            "ProjectId"
          ]
        );


      return String(
        value || ""
      ).trim() === target;

    }
  );

}


function toNumber(value) {

  if (
    typeof value === "number"
  ) {

    return value;

  }


  const cleaned =
    String(
      value || ""
    )
      .replace(
        /,/g,
        ""
      )
      .replace(
        /[^0-9.-]/g,
        ""
      );


  const number =
    Number(cleaned);


  return isNaN(number)
    ? 0
    : number;

}


function sumAmount(records) {

  return records.reduce(
    (
      total,
      record
    ) => {

      return (
        total +
        toNumber(
          firstValue(
            record,
            [
              "Amount",
              "Payment_Amount",
              "Bill_Amount",
              "Total",
              "Grand_Total"
            ]
          )
        )
      );

    },
    0
  );

}
function showSecuritySetupResult() {
  const result = initializeSecurityUpgrade();
  console.log(JSON.stringify(result, null, 2));
}
