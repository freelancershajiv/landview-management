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
  SPREADSHEET_ID: "1PDUQsDrEvbNBb1ZHrIJffhLKGo61mcgS",

  // LAND VIEW master Google Drive folder.
  // Every project folder is created/reused inside this folder.
  ROOT_FOLDER_ID: "1UkXpEI4Evw9b2x5E5vjIqmuYFBe2tcjX",

  SESSION_HOURS: 12,
  SESSION_IDLE_MINUTES: 60,
  SECURITY_REQUIRE_PROXY_SECRET: true,
  LOGIN_RATE_LIMIT: { MAX_FAILURES: 10, WINDOW_SECONDS: 900 },

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
    PERMISSIONS: "Permissions"
  }
};


/* =========================================================
   SPREADSHEET
========================================================= */

function getSpreadsheet() {

  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      "Spreadsheet not found. Bind this Apps Script to the LAND VIEW spreadsheet."
    );
  }

  return ss;
}


/* =========================================================
   SECURITY PRIMITIVES
========================================================= */

const SECURITY_KEYS = {
  PROXY_SECRET: "LAND_VIEW_PROXY_SECRET",
  PASSWORD_PEPPER: "LAND_VIEW_PASSWORD_PEPPER"
};

function getSecurityProperties_() {
  return PropertiesService.getScriptProperties();
}

function randomSecret_() {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random()
    )
  ).replace(/=+$/g, "");
}

/**
 * Run ONCE from the Apps Script editor. Copy proxySecret from the execution
 * result into Vercel as LAND_VIEW_PROXY_SECRET. Do not put it in GitHub.
 */
function initializeSecuritySecrets() {
  const props = getSecurityProperties_();
  let proxySecret = props.getProperty(SECURITY_KEYS.PROXY_SECRET);
  let pepper = props.getProperty(SECURITY_KEYS.PASSWORD_PEPPER);

  if (!proxySecret) {
    proxySecret = randomSecret_() + randomSecret_();
    props.setProperty(SECURITY_KEYS.PROXY_SECRET, proxySecret);
  }
  if (!pepper) {
    pepper = randomSecret_() + randomSecret_();
    props.setProperty(SECURITY_KEYS.PASSWORD_PEPPER, pepper);
  }

  ensureUserSecurityHeaders();
  return {
    initialized: true,
    proxySecret: proxySecret,
    message: "Copy proxySecret to Vercel LAND_VIEW_PROXY_SECRET. Password pepper remains private in Apps Script."
  };
}

function constantTimeEqual_(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function assertProxyRequest_(params) {
  if (!CONFIG.SECURITY_REQUIRE_PROXY_SECRET) return true;
  const expected = getSecurityProperties_().getProperty(SECURITY_KEYS.PROXY_SECRET);
  if (!expected) throw new Error("LAND VIEW security is not initialized. Run initializeSecuritySecrets() once.");
  const supplied = String((params && params.proxySecret) || "");
  if (!constantTimeEqual_(expected, supplied)) throw new Error("Unauthorized gateway request.");
  return true;
}

function passwordPepper_() {
  const pepper = getSecurityProperties_().getProperty(SECURITY_KEYS.PASSWORD_PEPPER);
  if (!pepper) throw new Error("LAND VIEW password security is not initialized.");
  return pepper;
}

function generatePasswordSalt_() {
  return Utilities.getUuid() + "-" + Utilities.getUuid();
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeHmacSha256Signature(
    String(salt || "") + "\n" + String(password || ""),
    passwordPepper_(),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function buildPasswordFields_(password, mustChange) {
  const salt = generatePasswordSalt_();
  return {
    Password: "",
    Password_Hash: hashPassword_(password, salt),
    Password_Salt: salt,
    Password_Version: "HMAC-SHA256-v1",
    Must_Change_Password: mustChange ? "TRUE" : "FALSE"
  };
}

function verifyPasswordRecord_(record, password) {
  const hash = String(firstValue(record, ["Password_Hash"]) || "");
  const salt = String(firstValue(record, ["Password_Salt"]) || "");
  if (hash && salt) return constantTimeEqual_(hash, hashPassword_(password, salt));

  // Legacy migration path: plaintext is accepted once, then upgraded immediately.
  const legacy = String(firstValue(record, ["Password", "password"]) || "");
  return legacy !== "" && constantTimeEqual_(legacy, String(password || ""));
}

function upgradeLegacyPasswordIfNeeded_(found, password) {
  const hash = String(firstValue(found.record, ["Password_Hash"]) || "");
  if (!hash) setRowValuesByHeader_(found, buildPasswordFields_(password, normalize(firstValue(found.record, ["Must_Change_Password"])) === "true"));
}

function loginRateKey_(identifier, clientKey) {
  const raw = normalize(identifier) + "|" + String(clientKey || "unknown");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return "LOGIN_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "").slice(0, 64);
}

function checkLoginRateLimit_(identifier, clientKey) {
  const cache = CacheService.getScriptCache();
  const key = loginRateKey_(identifier, clientKey);
  const count = Number(cache.get(key) || 0);
  if (count >= CONFIG.LOGIN_RATE_LIMIT.MAX_FAILURES) {
    throw new Error("Too many sign-in attempts. Please wait about 15 minutes and try again.");
  }
}

function recordLoginFailure_(identifier, clientKey) {
  const cache = CacheService.getScriptCache();
  const key = loginRateKey_(identifier, clientKey);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), CONFIG.LOGIN_RATE_LIMIT.WINDOW_SECONDS);
}

function clearLoginFailures_(identifier, clientKey) {
  CacheService.getScriptCache().remove(loginRateKey_(identifier, clientKey));
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

    case "syncProjectDriveFolders":
      return syncProjectDriveFolders(params);

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
    "getProjects",
    "getProject",
    "getDocuments",
    "createDocument",
    "getSiteVisits",
    "createSiteVisit",
    "changeOwnPassword"
  ],
  client: [
    "getProjects",
    "getProject",
    "getDocuments",
    "getProjectBilling",
    "getBillingRecords",
    "getPayments",
    "getInvoices",
    "changeOwnPassword"
  ]
};

function normalizeRoleName(value) {
  return normalize(value).replace(/\s+/g, "");
}

function isAdminRole(role) {
  const r = normalizeRoleName(role);
  return r === "admin" || r === "manager";
}

function authorizeActionRequest(action, params) {
  assertProxyRequest_(params);
  const publicActions = ["health", "login", "logout", "getSession"];
  if (publicActions.includes(action)) return null;

  const session = requireSession(params);
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
  const clientKey = String(params._clientKey || "unknown");

  if (!identifier || !password) return { success: false, message: "Invalid User ID or password." };
  checkLoginRateLimit_(identifier, clientKey);

  const normalizedIdentifier = normalize(identifier);
  const phoneIdentifier = normalizePhoneIdentifier(identifier);
  const found = findUserRow_(user => {
    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    return normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);
  });

  if (!found || !isActiveUser(found.record) || !verifyPasswordRecord_(found.record, password)) {
    recordLoginFailure_(identifier, clientKey);
    if (found) {
      const failures = Number(firstValue(found.record, ["Failed_Login_Count"]) || 0) + 1;
      setRowValuesByHeader_(found, { Failed_Login_Count: failures });
    }
    return { success: false, message: "Invalid User ID or password." };
  }

  const role = normalizeRoleName(firstValue(found.record, ["Role", "role"]));
  if (!["admin", "manager", "employee", "client"].includes(role)) {
    return { success: false, message: "This account does not have a supported LAND VIEW role." };
  }

  upgradeLegacyPasswordIfNeeded_(found, password);
  clearLoginFailures_(identifier, clientKey);
  setRowValuesByHeader_(found, { Failed_Login_Count: 0, Last_Login: new Date() });

  const token = createSession(found.record);
  return { success: true, data: { token: token, user: sanitizeUser(found.record) } };
}

function createSession(user) {
  const token = randomSecret_() + randomSecret_();
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
    expiresAt: now + CONFIG.SESSION_HOURS * 60 * 60 * 1000
  };
  PropertiesService.getScriptProperties().setProperty("SESSION_" + token, JSON.stringify(session));
  return token;
}

function readSession(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return null;
  const key = "SESSION_" + cleanToken;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(key);
  if (!raw) return null;

  let session;
  try { session = JSON.parse(raw); }
  catch { props.deleteProperty(key); return null; }

  const now = Date.now();
  const idleMs = CONFIG.SESSION_IDLE_MINUTES * 60 * 1000;
  if (!session || !session.expiresAt || now > Number(session.expiresAt) || (session.lastSeenAt && now - Number(session.lastSeenAt) > idleMs)) {
    props.deleteProperty(key);
    return null;
  }

  if (!session.lastSeenAt || now - Number(session.lastSeenAt) > 5 * 60 * 1000) {
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

function requireAdminSession(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  return session;
}

function logoutUser(params) {
  const token = String(params.token || "").trim();
  if (token) PropertiesService.getScriptProperties().deleteProperty("SESSION_" + token);
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
    "Password_Version",
    "Failed_Login_Count",
    "Last_Login"
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
  if (record.Password && !record.Password_Hash) {
    Object.assign(record, buildPasswordFields_(String(record.Password), normalize(record.Must_Change_Password) === "true"));
  }
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
  const record = appendUserRecord_({
    User_ID: employeeId,
    Name: firstValue(employee, ["Employee_Name", "Employee Name", "Name"]) || employeeId,
    Username: employeeId,
    Password: temporaryPassword,
    Role: "Employee",
    Active: "TRUE",
    Employee_ID: employeeId,
    Project_IDs: firstValue(employee, ["Project_IDs", "Project IDs", "Projects", "Project_ID"]) || "",
    Must_Change_Password: "TRUE",
    Created_Date: new Date()
  });
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
  appendUserRecord_({
    User_ID: userId,
    Name: firstValue(project, ["Client_Name", "Client Name"]) || "LAND VIEW Client",
    Username: username,
    Password: temporaryPassword,
    Role: "Client",
    Active: "TRUE",
    Employee_ID: "",
    Project_IDs: projectId,
    Must_Change_Password: "TRUE",
    Created_Date: new Date()
  });
  project.Client_User_ID = userId;
  project.Client_Username = username;
  return { created: true, userId, username, temporaryPassword, projectIds: projectId };
}

function initializeRoleSecurity() {
  ensureUserSecurityHeaders();
  ensureProjectClientSecurityHeaders();

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
    Created_Date: firstValue(user, ["Created_Date", "Created Date"]),
    Last_Login: firstValue(user, ["Last_Login"]),
    Password_Secured: Boolean(firstValue(user, ["Password_Hash"]))
  };
}

function resetUserPassword(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  const target = String(params.userId || params.User_ID || "").trim();
  if (!target) throw new Error("User ID is required.");
  const found = findUserRow_(u => String(firstValue(u, ["User_ID", "User ID"]) || "").trim() === target);
  if (!found) throw new Error("User not found.");
  const temporaryPassword = generateTemporaryPassword_();
  setRowValuesByHeader_(found, Object.assign(buildPasswordFields_(temporaryPassword, true), { Active: "TRUE", Failed_Login_Count: 0 }));
  return { success: true, data: { userId: target, username: firstValue(found.record, ["Username"]), temporaryPassword } };
}

function changeOwnPassword(params) {
  const session = requireSession(params);
  const currentPassword = String(params.currentPassword || "");
  const newPassword = String(params.newPassword || "");
  if (newPassword.length < 10) throw new Error("New password must be at least 10 characters.");
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw new Error("New password must include uppercase, lowercase, number, and symbol.");
  }
  const found = findUserRow_(u => String(firstValue(u, ["User_ID", "User ID"]) || "").trim() === String(session.userId || "").trim());
  if (!found) throw new Error("User not found.");
  if (!verifyPasswordRecord_(found.record, currentPassword)) throw new Error("Current password is incorrect.");
  setRowValuesByHeader_(found, buildPasswordFields_(newPassword, false));

  const oldToken = String(params.token || "").trim();
  if (oldToken) PropertiesService.getScriptProperties().deleteProperty("SESSION_" + oldToken);
  const token = createSession(Object.assign({}, found.record, { Password: "" }));
  return { success: true, data: { changed: true, token: token } };
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
  delete user.action; delete user.token; delete user.proxySecret; delete user._clientKey;

  const role = normalizeRoleName(user.Role || user.role);
  if (!["admin", "manager", "employee", "client"].includes(role)) throw new Error("Invalid user role.");
  if (!user.Password && !user.password) throw new Error("A temporary password is required.");
  user.Password = String(user.Password || user.password);
  user.Role = role.charAt(0).toUpperCase() + role.slice(1);
  user.Active = user.Active === undefined ? "TRUE" : user.Active;
  user.Must_Change_Password = "TRUE";
  user.Created_Date = new Date();
  const record = appendUserRecord_(user);
  return { success: true, data: { created: true, user: sanitizeUserForAdminList_(record) } };
}


/* =========================================================
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

  requireAdminSession(params);

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

  requireAdminSession(params);

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

  requireAdminSession(params);

  const projectId =
    String(
      params.projectId || ""
    ).trim();


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

  requireAdminSession(params);

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
    String(
      CONFIG.ROOT_FOLDER_ID ||
      ""
    ).trim();


  if (!rootFolderId) {

    throw new Error(
      "CONFIG.ROOT_FOLDER_ID is not configured."
    );

  }


  try {

    return DriveApp
      .getFolderById(
        rootFolderId
      );

  } catch (error) {

    throw new Error(
      "LAND VIEW root Drive folder could not be opened. Check CONFIG.ROOT_FOLDER_ID and Apps Script Drive permissions."
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


  return {
    rootFolder: rootFolder,
    projectFolder: projectFolder,
    documentsFolder: documentsFolder,
    invoicesFolder: invoicesFolder
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
   DRIVE — BULK INITIALIZATION / MIGRATION
========================================================= */

function syncProjectDriveFolders(params) {

  requireSession(params);

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
        CONFIG.ROOT_FOLDER_ID,
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
   EMPLOYEES
========================================================= */

function getEmployees(params) {

  requireAdminSession(params);

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

  const employee =
    Object.assign({}, params);

  delete employee.action;
  delete employee.token;


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

  requireAdminSession(params);

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

  requireAdminSession(params);

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

  requireAdminSession(params);


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

  requireAdminSession(params);

  return appendRecord(
    CONFIG.SHEETS.BILLS,
    cleanParams(params),
    "BILL-",
    "Bill_ID"
  );

}


function createBill(params) {

  requireAdminSession(params);

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

  requireAdminSession(params);

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    cleanParams(params),
    "PAY-",
    "Payment_ID"
  );

}


function createPayment(params) {

  requireAdminSession(params);

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

  requireAdminSession(params);

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
   PERMISSIONS
========================================================= */

function getPermissions(params) {

  requireAdminSession(params);

  return {
    success: true,

    data:
      readSheet(
        CONFIG.SHEETS.PERMISSIONS
      )
  };

}


function createPermission(params) {

  requireAdminSession(params);

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
          key !== "token"
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