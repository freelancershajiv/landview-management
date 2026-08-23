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
  SPREADSHEET_ID: "",

  SESSION_HOURS: 24,

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

  switch (action) {

    case "health":
      return health();

    case "login":
      return loginUser(params);

    case "logout":
      return logoutUser(params);

    case "getSession":
      return getSession(params);

    case "getDashboard":
      return getDashboard(params);

    case "getUsers":
      return getUsers(params);

    case "createUser":
      return createUser(params);

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
   AUTHENTICATION
========================================================= */

/* =========================================================
   AUTHENTICATION
========================================================= */

function loginUser(params) {

  const identifier =
    String(
      params.userId ||
      params.User_ID ||
      params.username ||
      params.Username ||
      ""
    ).trim();

  const password =
    String(
      params.password ||
      params.Password ||
      ""
    );


  if (!identifier || !password) {

    return {
      success: false,
      message:
        "Invalid User ID or password."
    };

  }


  const users =
    readSheet(
      CONFIG.SHEETS.USERS
    );


  if (!users || !users.length) {

    return {
      success: false,
      message:
        "No users found in the Users sheet."
    };

  }


  const normalizedIdentifier =
    normalize(identifier);


  let foundUser = null;


  for (
    let i = 0;
    i < users.length;
    i++
  ) {

    const user =
      users[i];


    const rowUserId =
      normalize(
        firstValue(
          user,
          [
            "User_ID",
            "User ID",
            "UserId",
            "userId"
          ]
        )
      );


    const rowUsername =
      normalize(
        firstValue(
          user,
          [
            "Username",
            "username",
            "User_Name",
            "User Name"
          ]
        )
      );


    const rowPassword =
      String(
        firstValue(
          user,
          [
            "Password",
            "password"
          ]
        ) ?? ""
      );


    const active =
      isActiveUser(
        user
      );


    const identifierMatches =
      normalizedIdentifier === rowUserId ||
      normalizedIdentifier === rowUsername;


    if (
      identifierMatches &&
      password === rowPassword &&
      active
    ) {

      foundUser =
        user;

      break;

    }

  }


  if (!foundUser) {

    return {
      success: false,
      message:
        "Invalid User ID or password."
    };

  }


  const token =
    createSession(
      foundUser
    );


  const safeUser =
    sanitizeUser(
      foundUser
    );


  return {

    success: true,

    data: {

      token:
        token,

      user:
        safeUser

    }

  };

}


/* =========================================================
   SESSION
========================================================= */

function createSession(user) {

  const token =
    Utilities.getUuid() +
    "-" +
    Utilities.getUuid();


  const userId =
    firstValue(
      user,
      [
        "User_ID",
        "User ID",
        "UserId"
      ]
    );


  const username =
    firstValue(
      user,
      [
        "Username",
        "username",
        "User_Name",
        "User Name"
      ]
    );


  const name =
    firstValue(
      user,
      [
        "Name",
        "name"
      ]
    );


  const role =
    firstValue(
      user,
      [
        "Role",
        "role"
      ]
    );


  const now =
    Date.now();


  const session = {

    userId:
      String(
        userId || ""
      ),

    username:
      String(
        username || ""
      ),

    name:
      String(
        name || ""
      ),

    role:
      String(
        role || ""
      ),

    createdAt:
      now,

    expiresAt:
      now +
      CONFIG.SESSION_HOURS *
      60 *
      60 *
      1000

  };


  PropertiesService
    .getScriptProperties()
    .setProperty(
      "SESSION_" + token,
      JSON.stringify(session)
    );


  return token;

}


/* =========================================================
   READ SESSION
========================================================= */

function readSession(token) {

  const cleanToken =
    String(
      token || ""
    ).trim();


  if (!cleanToken) {
    return null;
  }


  const key =
    "SESSION_" +
    cleanToken;


  const raw =
    PropertiesService
      .getScriptProperties()
      .getProperty(key);


  if (!raw) {
    return null;
  }


  let session;


  try {

    session =
      JSON.parse(raw);

  } catch {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(key);

    return null;

  }


  if (
    !session ||
    !session.expiresAt
  ) {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(key);

    return null;

  }


  if (
    Date.now() >
    Number(
      session.expiresAt
    )
  ) {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(key);

    return null;

  }


  return session;

}


/* =========================================================
   GET SESSION
========================================================= */

function getSession(params) {

  const token =
    String(
      params.token || ""
    ).trim();


  if (!token) {

    return {
      success: false,
      message:
        "Session expired."
    };

  }


  const session =
    readSession(
      token
    );


  if (!session) {

    return {
      success: false,
      message:
        "Session expired."
    };

  }


  return {

    success: true,

    data: {

      authenticated: true,

      user: {

        userId:
          session.userId,

        username:
          session.username,

        name:
          session.name,

        role:
          session.role,

        User_ID:
          session.userId,

        Username:
          session.username,

        Name:
          session.name,

        Role:
          session.role

      }

    }

  };

}


/* =========================================================
   REQUIRE SESSION
========================================================= */

function requireSession(params) {

  const token =
    String(
      params.token || ""
    ).trim();


  if (!token) {

    throw new Error(
      "Unauthorized"
    );

  }


  const session =
    readSession(
      token
    );


  if (!session) {

    throw new Error(
      "Unauthorized"
    );

  }


  return session;

}


/* =========================================================
   LOGOUT
========================================================= */

function logoutUser(params) {

  const token =
    String(
      params.token || ""
    ).trim();


  if (token) {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(
        "SESSION_" + token
      );

  }


  return {

    success: true,

    data: {
      loggedOut: true
    }

  };

}


/* =========================================================
   SANITIZE USER
========================================================= */

function sanitizeUser(user) {

  const userId =
    firstValue(
      user,
      [
        "User_ID",
        "User ID",
        "UserId"
      ]
    );


  const username =
    firstValue(
      user,
      [
        "Username",
        "username",
        "User_Name",
        "User Name"
      ]
    );


  const name =
    firstValue(
      user,
      [
        "Name",
        "name"
      ]
    );


  const role =
    firstValue(
      user,
      [
        "Role",
        "role"
      ]
    );


  return {

    userId:
      userId,

    username:
      username,

    name:
      name,

    role:
      role,

    User_ID:
      userId,

    Username:
      username,

    Name:
      name,

    Role:
      role

  };

}


/* =========================================================
   SESSION
========================================================= */

function createSession(user) {

  const token =
    Utilities.getUuid() +
    "-" +
    Utilities.getUuid();


  const session = {

    userId:
      firstValue(
        user,
        [
          "User_ID",
          "User ID",
          "UserId"
        ]
      ),

    username:
      firstValue(
        user,
        [
          "Username",
          "username"
        ]
      ),

    name:
      firstValue(
        user,
        [
          "Name",
          "name"
        ]
      ),

    role:
      firstValue(
        user,
        [
          "Role",
          "role"
        ]
      ),

    createdAt:
      Date.now(),

    expiresAt:
      Date.now() +
      CONFIG.SESSION_HOURS *
      60 *
      60 *
      1000

  };


  PropertiesService
    .getScriptProperties()
    .setProperty(
      "SESSION_" + token,
      JSON.stringify(session)
    );


  return token;

}


function getSession(params) {

  const token =
    String(
      params.token || ""
    ).trim();


  if (!token) {

    return {
      success: false,
      message: "Session expired."
    };

  }


  const session =
    readSession(
      token
    );


  if (!session) {

    return {
      success: false,
      message: "Session expired."
    };

  }


  return {
    success: true,

    data: {
      authenticated: true,

      user: {
        userId:
          session.userId,

        username:
          session.username,

        name:
          session.name,

        role:
          session.role,

        User_ID:
          session.userId,

        Username:
          session.username,

        Name:
          session.name,

        Role:
          session.role
      }
    }
  };

}


function readSession(token) {

  const key =
    "SESSION_" + token;


  const raw =
    PropertiesService
      .getScriptProperties()
      .getProperty(key);


  if (!raw) {
    return null;
  }


  let session;


  try {

    session =
      JSON.parse(raw);

  } catch {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(key);

    return null;

  }


  if (
    !session.expiresAt ||
    Date.now() >
    Number(session.expiresAt)
  ) {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(key);

    return null;

  }


  return session;

}


function logoutUser(params) {

  const token =
    String(
      params.token || ""
    ).trim();


  if (token) {

    PropertiesService
      .getScriptProperties()
      .deleteProperty(
        "SESSION_" + token
      );

  }


  return {
    success: true,

    data: {
      loggedOut: true
    }
  };

}


/* =========================================================
   REQUIRE SESSION
========================================================= */

function requireSession(params) {

  const token =
    String(
      params.token || ""
    ).trim();


  if (!token) {

    throw new Error(
      "Unauthorized"
    );

  }


  const session =
    readSession(
      token
    );


  if (!session) {

    throw new Error(
      "Unauthorized"
    );

  }


  return session;

}


/* =========================================================
   USERS
========================================================= */

function getUsers(params) {

  requireSession(params);

  return {
    success: true,
    data:
      readSheet(
        CONFIG.SHEETS.USERS
      )
  };

}


function createUser(params) {

  requireSession(params);

  const user =
    params.user || params;


  const sheet =
    getSheet(
      CONFIG.SHEETS.USERS
    );


  const headers =
    getHeaders(sheet);


  const row =
    headers.map(
      header => {

        if (
          header === "User_ID"
        ) {

          return user.User_ID ||
            user.userId ||
            generateId(
              "USR-",
              sheet,
              "User_ID"
            );

        }

        return user[header] ??
          "";

      }
    );


  sheet.appendRow(row);


  return {
    success: true,
    data: {
      created: true,
      user: user
    }
  };

}


/* =========================================================
   PROJECTS
========================================================= */

function getProjects(params) {

  requireSession(params);

  return {
    success: true,

    data:
      readSheet(
        CONFIG.SHEETS.PROJECTS
      )
  };

}


function getProject(params) {

  requireSession(params);

  const projectId =
    String(
      params.projectId || ""
    ).trim();


  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const project =
    projects.find(
      p =>
        String(
          firstValue(
            p,
            [
              "Project_ID",
              "Project ID",
              "ProjectId"
            ]
          )
        ).trim() ===
        projectId
    );


  if (!project) {

    throw new Error(
      "Project not found."
    );

  }


  return {
    success: true,
    data: project
  };

}


function createProject(params) {

  const session =
    requireSession(params);

  const project =
    Object.assign({}, params);

  delete project.action;
  delete project.token;


  const sheet =
    getSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const headers =
    getHeaders(sheet);


  if (!project.Project_ID) {

    project.Project_ID =
      generateId(
        "LV-",
        sheet,
        "Project_ID"
      );

  }


  const row =
    headers.map(
      h =>
        project[h] ??
        ""
    );


  sheet.appendRow(row);


  return {
    success: true,
    data: project
  };

}


function updateProject(params) {

  requireSession(params);

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

  requireSession(params);

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

  requireSession(params);

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

  requireSession(params);

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

  requireSession(params);

  const projectId =
    String(
      params.projectId || ""
    ).trim();


  const projects =
    readSheet(
      CONFIG.SHEETS.PROJECTS
    );


  const project =
    projects.find(
      p =>
        String(
          firstValue(
            p,
            [
              "Project_ID",
              "Project ID"
            ]
          )
        ).trim() === projectId
    );


  if (!project) {

    throw new Error(
      "Project not found."
    );

  }


  const folderId =
    firstValue(
      project,
      [
        "Drive_Folder_ID",
        "Drive Folder ID",
        "Folder_ID"
      ]
    );


  const folderUrl =
    firstValue(
      project,
      [
        "Drive_Folder_URL",
        "Drive Folder URL",
        "Folder_URL"
      ]
    );


  return {
    success: true,

    data: {
      projectId: projectId,
      folderId: folderId || "",
      url: folderUrl || ""
    }
  };

}


/* =========================================================
   EMPLOYEES
========================================================= */

function getEmployees(params) {

  requireSession(params);

  return {
    success: true,

    data:
      readSheet(
        CONFIG.SHEETS.EMPLOYEES
      )
  };

}


function createEmployee(params) {

  requireSession(params);

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


  return {
    success: true,
    data: employee
  };

}


function updateEmployee(params) {

  requireSession(params);

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

  requireSession(params);

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

  requireSession(params);

  let data =
    readSheet(
      CONFIG.SHEETS.DOCUMENTS
    );


  if (params.projectId) {

    data =
      filterByProject(
        data,
        params.projectId
      );

  }


  return {
    success: true,
    data: data
  };

}


function createDocument(params) {

  requireSession(params);

  const document =
    cleanParams(params);


  return appendRecord(
    CONFIG.SHEETS.DOCUMENTS,
    document,
    "DOC-",
    "Document_ID"
  );

}


/* =========================================================
   SITE VISITS
========================================================= */

function getSiteVisits(params) {

  requireSession(params);

  let data =
    readSheet(
      CONFIG.SHEETS.SITE_VISITS
    );


  if (params.projectId) {

    data =
      filterByProject(
        data,
        params.projectId
      );

  }


  return {
    success: true,
    data: data
  };

}


function createSiteVisit(params) {

  requireSession(params);

  const visit =
    cleanParams(params);


  return appendRecord(
    CONFIG.SHEETS.SITE_VISITS,
    visit,
    "SV-",
    "Visit_ID"
  );

}


/* =========================================================
   BILLING
========================================================= */

function getBillingDashboard(params) {

  requireSession(params);


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

  requireSession(params);

  const projectId =
    params.projectId;


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


  return {
    success: true,

    data: {
      projectId: projectId,
      bills: bills,
      payments: payments,
      totalBill: totalBill,
      totalPaid: totalPaid,
      due:
        totalBill - totalPaid
    }
  };

}


function getBillingRecords(params) {

  requireSession(params);

  const projectId =
    params.projectId;


  const category =
    String(
      params.category || ""
    ).toLowerCase();


  let sheetName =
    CONFIG.SHEETS.BILLS;


  if (
    category.includes(
      "payment"
    )
  ) {

    sheetName =
      CONFIG.SHEETS.PAYMENTS;

  }


  const records =
    filterByProject(
      readSheet(sheetName),
      projectId
    );


  return {
    success: true,
    data: records
  };

}


/* =========================================================
   BILLS
========================================================= */

function saveBill(params) {

  requireSession(params);

  return appendRecord(
    CONFIG.SHEETS.BILLS,
    cleanParams(params),
    "BILL-",
    "Bill_ID"
  );

}


function createBill(params) {

  requireSession(params);

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

  requireSession(params);

  let payments =
    readSheet(
      CONFIG.SHEETS.PAYMENTS
    );


  if (params.projectId) {

    payments =
      filterByProject(
        payments,
        params.projectId
      );

  }


  return {
    success: true,
    data: payments
  };

}


function savePayment(params) {

  requireSession(params);

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    cleanParams(params),
    "PAY-",
    "Payment_ID"
  );

}


function createPayment(params) {

  requireSession(params);

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

  requireSession(params);

  let invoices =
    readSheet(
      CONFIG.SHEETS.INVOICES
    );


  if (params.projectId) {

    invoices =
      filterByProject(
        invoices,
        params.projectId
      );

  }


  return {
    success: true,
    data: invoices
  };

}


function createInvoice(params) {

  requireSession(params);

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


  const projectFolder =
    getInvoiceProjectFolder(
      project
    );


  const invoicesFolder =
    getOrCreateChildFolder(
      projectFolder,
      "Invoices"
    );


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

  let folderId =
    String(
      firstValue(
        project,
        [
          "Drive_Folder_ID",
          "Drive Folder ID",
          "Folder_ID"
        ]
      ) || ""
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
      ) || ""
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


  if (!folderId) {

    throw new Error(
      "Project Drive folder is not configured. Add Drive_Folder_ID or Drive_Folder_URL to the Projects sheet before generating an invoice."
    );

  }


  try {

    return DriveApp
      .getFolderById(
        folderId
      );

  } catch (error) {

    throw new Error(
      "The project Drive folder could not be opened. Check the Drive folder ID and Apps Script permissions."
    );

  }

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


  const tempDocument =
    DocumentApp.create(
      options.invoiceId +
      " - LAND VIEW Invoice"
    );


  const tempFile =
    DriveApp.getFileById(
      tempDocument.getId()
    );


  try {

    buildInvoiceDocument(
      tempDocument,
      options
    );


    tempDocument
      .saveAndClose();


    Utilities.sleep(
      500
    );


    const pdfBlob =
      tempFile
        .getAs(
          MimeType.PDF
        )
        .setName(
          fileName
        );


    return options.folder
      .createFile(
        pdfBlob
      );

  } finally {

    try {

      tempFile.setTrashed(
        true
      );

    } catch (ignore) {
      // Ignore cleanup failure.
    }

  }

}


function buildInvoiceDocument(
  document,
  options
) {

  const body =
    document.getBody();


  const title =
    body.appendParagraph(
      "LAND VIEW"
    );

  title
    .editAsText()
    .setBold(
      true
    )
    .setFontSize(
      24
    )
    .setForegroundColor(
      "#111315"
    );


  const tagline =
    body.appendParagraph(
      "ARCHITECTS & ENGINEERS"
    );

  tagline
    .editAsText()
    .setBold(
      true
    )
    .setFontSize(
      9
    )
    .setForegroundColor(
      "#6B7280"
    );


  body.appendParagraph(
    ""
  );


  const heading =
    body.appendParagraph(
      "INVOICE"
    );

  heading
    .editAsText()
    .setBold(
      true
    )
    .setFontSize(
      30
    )
    .setForegroundColor(
      "#111315"
    );


  body.appendHorizontalRule();


  const project =
    options.project;


  const infoRows = [
    [
      "Invoice No.",
      options.invoiceId,
      "Invoice Date",
      formatInvoiceDate(
        options.invoiceDate
      )
    ],
    [
      "Project",
      options.projectName || "—",
      "Project ID",
      options.projectId
    ],
    [
      "Client",
      options.clientName || "—",
      "Phone",
      String(
        firstValue(
          project,
          [
            "Phone_Number",
            "Phone Number",
            "Phone"
          ]
        ) || "—"
      )
    ],
    [
      "Location",
      String(
        firstValue(
          project,
          [
            "Location",
            "Project_Location",
            "Project Location"
          ]
        ) || "—"
      ),
      "Project Type",
      String(
        firstValue(
          project,
          [
            "Project_Type",
            "Project Type",
            "Type"
          ]
        ) || "—"
      )
    ]
  ];


  const infoTable =
    body.appendTable(
      infoRows
    );


  styleInvoiceInfoTable(
    infoTable
  );


  body.appendParagraph(
    ""
  );


  appendInvoiceSectionHeading(
    body,
    "BILL DETAILS"
  );


  const billRows = [
    [
      "Bill ID",
      "Date",
      "Description",
      "Amount"
    ]
  ];


  if (
    options.bills.length
  ) {

    options.bills.forEach(
      bill => {

        billRows.push([
          String(
            firstValue(
              bill,
              [
                "Bill_ID",
                "Bill ID"
              ]
            ) || "—"
          ),
          formatInvoiceDate(
            firstValue(
              bill,
              [
                "Bill_Date",
                "Date"
              ]
            )
          ),
          String(
            firstValue(
              bill,
              [
                "Description",
                "Particulars",
                "Item",
                "Notes"
              ]
            ) || "—"
          ),
          formatInvoiceMoney(
            firstValue(
              bill,
              [
                "Amount",
                "Bill_Amount",
                "Total",
                "Grand_Total"
              ]
            )
          )
        ]);

      }
    );

  } else {

    billRows.push([
      "—",
      "—",
      "No bill records found for this project.",
      formatInvoiceMoney(0)
    ]);

  }


  const billTable =
    body.appendTable(
      billRows
    );


  styleInvoiceDataTable(
    billTable,
    3
  );


  body.appendParagraph(
    ""
  );


  const summaryTable =
    body.appendTable([
      [
        "Total Billed",
        formatInvoiceMoney(
          options.totalBill
        )
      ],
      [
        "Total Paid",
        formatInvoiceMoney(
          options.totalPaid
        )
      ],
      [
        "BALANCE DUE",
        formatInvoiceMoney(
          options.due
        )
      ]
    ]);


  styleInvoiceSummaryTable(
    summaryTable
  );


  if (
    options.payments.length
  ) {

    body.appendParagraph(
      ""
    );


    appendInvoiceSectionHeading(
      body,
      "PAYMENT HISTORY"
    );


    const paymentRows = [
      [
        "Payment ID",
        "Date",
        "Method / Reference",
        "Amount"
      ]
    ];


    options.payments.forEach(
      payment => {

        const method =
          String(
            firstValue(
              payment,
              [
                "Payment_Method",
                "Method"
              ]
            ) || ""
          );


        const reference =
          String(
            firstValue(
              payment,
              [
                "Reference_No",
                "Reference",
                "Reference Number"
              ]
            ) || ""
          );


        paymentRows.push([
          String(
            firstValue(
              payment,
              [
                "Payment_ID",
                "Payment ID"
              ]
            ) || "—"
          ),
          formatInvoiceDate(
            firstValue(
              payment,
              [
                "Payment_Date",
                "Date"
              ]
            )
          ),
          [
            method,
            reference
          ]
            .filter(Boolean)
            .join(" / ") || "—",
          formatInvoiceMoney(
            firstValue(
              payment,
              [
                "Amount",
                "Payment_Amount"
              ]
            )
          )
        ]);

      }
    );


    const paymentTable =
      body.appendTable(
        paymentRows
      );


    styleInvoiceDataTable(
      paymentTable,
      3
    );

  }


  body.appendParagraph(
    ""
  );

  body.appendHorizontalRule();


  const footer =
    body.appendParagraph(
      "This invoice was generated by the LAND VIEW Management System."
    );

  footer
    .editAsText()
    .setFontSize(
      8
    )
    .setForegroundColor(
      "#7A7D80"
    );

}


function appendInvoiceSectionHeading(
  body,
  text
) {

  const paragraph =
    body.appendParagraph(
      text
    );


  paragraph
    .editAsText()
    .setBold(
      true
    )
    .setFontSize(
      10
    )
    .setForegroundColor(
      "#111315"
    );


  return paragraph;

}


function styleInvoiceInfoTable(table) {

  for (
    let rowIndex = 0;
    rowIndex < table.getNumRows();
    rowIndex++
  ) {

    const row =
      table.getRow(
        rowIndex
      );


    for (
      let columnIndex = 0;
      columnIndex < row.getNumCells();
      columnIndex++
    ) {

      const cell =
        row.getCell(
          columnIndex
        );


      cell
        .editAsText()
        .setFontSize(
          9
        );


      if (
        columnIndex === 0 ||
        columnIndex === 2
      ) {

        cell
          .setBackgroundColor(
            "#F1F2EF"
          );

        cell
          .editAsText()
          .setBold(
            true
          )
          .setForegroundColor(
            "#4B4F52"
          );

      }

    }

  }

}


function styleInvoiceDataTable(
  table,
  amountColumnIndex
) {

  if (
    table.getNumRows() < 1
  ) {
    return;
  }


  const headerRow =
    table.getRow(0);


  for (
    let columnIndex = 0;
    columnIndex < headerRow.getNumCells();
    columnIndex++
  ) {

    const cell =
      headerRow.getCell(
        columnIndex
      );


    cell
      .setBackgroundColor(
        "#111315"
      );

    cell
      .editAsText()
      .setBold(
        true
      )
      .setFontSize(
        8
      )
      .setForegroundColor(
        "#FFFFFF"
      );

  }


  for (
    let rowIndex = 1;
    rowIndex < table.getNumRows();
    rowIndex++
  ) {

    const row =
      table.getRow(
        rowIndex
      );


    for (
      let columnIndex = 0;
      columnIndex < row.getNumCells();
      columnIndex++
    ) {

      const cell =
        row.getCell(
          columnIndex
        );


      cell
        .editAsText()
        .setFontSize(
          8
        );


      if (
        columnIndex === amountColumnIndex
      ) {

        cell
          .editAsText()
          .setBold(
            true
          );

      }

    }

  }

}


function styleInvoiceSummaryTable(table) {

  for (
    let rowIndex = 0;
    rowIndex < table.getNumRows();
    rowIndex++
  ) {

    const row =
      table.getRow(
        rowIndex
      );


    for (
      let columnIndex = 0;
      columnIndex < row.getNumCells();
      columnIndex++
    ) {

      const cell =
        row.getCell(
          columnIndex
        );


      cell
        .editAsText()
        .setFontSize(
          rowIndex === 2
            ? 11
            : 9
        );


      if (
        columnIndex === 0 ||
        rowIndex === 2
      ) {

        cell
          .editAsText()
          .setBold(
            true
          );

      }


      if (
        rowIndex === 2
      ) {

        cell
          .setBackgroundColor(
            "#EAF2C7"
          );

      }

    }

  }

}


function formatInvoiceDate(value) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {

    return "—";

  }


  let date = value;


  if (
    Object.prototype.toString.call(
      value
    ) !== "[object Date]"
  ) {

    date =
      new Date(
        value
      );

  }


  if (
    isNaN(
      date.getTime()
    )
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


function formatInvoiceMoney(value) {

  const amount =
    toNumber(
      value
    );


  const fixed =
    amount
      .toFixed(2)
      .split(".");


  fixed[0] =
    fixed[0].replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ","
    );


  return (
    "৳ " +
    fixed.join(".")
  );

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
    .substring(
      0,
      80
    );

}



/* =========================================================
   PERMISSIONS
========================================================= */

function getPermissions(params) {

  requireSession(params);

  return {
    success: true,

    data:
      readSheet(
        CONFIG.SHEETS.PERMISSIONS
      )
  };

}


function createPermission(params) {

  requireSession(params);

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


function sanitizeUser(user) {

  return {

    userId:
      firstValue(
        user,
        [
          "User_ID",
          "User ID",
          "UserId"
        ]
      ),

    username:
      firstValue(
        user,
        [
          "Username",
          "username"
        ]
      ),

    name:
      firstValue(
        user,
        [
          "Name",
          "name"
        ]
      ),

    role:
      firstValue(
        user,
        [
          "Role",
          "role"
        ]
      ),

    User_ID:
      firstValue(
        user,
        [
          "User_ID",
          "User ID",
          "UserId"
        ]
      ),

    Username:
      firstValue(
        user,
        [
          "Username",
          "username"
        ]
      ),

    Name:
      firstValue(
        user,
        [
          "Name",
          "name"
        ]
      ),

    Role:
      firstValue(
        user,
        [
          "Role",
          "role"
        ]
      )

  };

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