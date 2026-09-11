/* LAND VIEW — PUBLIC PROJECT PORTFOLIO
 * Public project images are sourced only from each project's
 * "3D Design - Exterior" Google Drive folder.
 *
 * Naming rule:
 *   front.jpeg / front.jpg / front.png / front.webp => cover image
 *   all other JPG/JPEG/PNG/WEBP files => gallery images
 */

function trustedPinSessionFromGateway_(params) {
  const userId = String((params && params._trustedPinSessionUserId) || "").trim();
  if (!userId) return null;

  const users = readSheet(CONFIG.SHEETS.USERS);
  const foundUser = users.find(function(user) {
    const rowUserId = String(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]) || "").trim();
    const role = normalizeRoleName(firstValue(user, ["Role", "role"]));
    return rowUserId === userId && isActiveUser(user) && isAdminRole(role);
  }) || null;

  if (!foundUser) return { success: false, message: "Trusted Admin account is unavailable." };

  const token = createSession(foundUser);
  const safeUser = sanitizeUser(foundUser);
  auditSecurityEvent_({ userId: safeUser.userId, role: safeUser.role }, "TRUSTED_PIN_LOGIN", "", "SUCCESS", "7-day trusted device");
  return { success: true, data: { token: token, user: safeUser } };
}

function employeeWorkspaceFromGateway_(params) {
  const requested = String((params && params._employeeWorkspace) || "").trim();
  if (requested !== "1") return null;

  const session = requireSession(params);
  if (normalizeRoleName(session.role) !== "employee") return { success: false, error: "Employee access required." };

  const allowedIds = getAllowedProjectIds(session) || [];
  const allowed = {};
  allowedIds.forEach(function(value) {
    const id = normalizeFinanceWorkflowProjectId_(value);
    if (id) allowed[id] = true;
  });

  const ss = getFinanceWorkbook_();
  const workflowSheet = ensureFinanceWorkflowSheet_(ss);
  syncBillingWorkflow_(ss, workflowSheet);

  const workflow = financeWorkflowRows_(workflowSheet).filter(function(row) {
    return !!allowed[normalizeFinanceWorkflowProjectId_(row.Project_ID)];
  });
  const employeeId = String(session.employeeId || "").trim();
  const assigned = workflow.filter(function(row) { return employeeId && String(row.Assigned_Employee_ID || "").trim() === employeeId; });
  const unassigned = workflow.filter(function(row) { return !String(row.Assigned_Employee_ID || "").trim(); });

  return { success: true, data: { workflow: workflow, assignedWorkflow: assigned, unassignedWorkflow: unassigned, allowedProjectIds: Object.keys(allowed), employeeId: employeeId, source: "LV - Auto Invoice / Workflow", updatedAt: new Date().toISOString() } };
}

function ensureProjectPublicHeaders_() {
  return ensureHeaders_(getSheet(CONFIG.SHEETS.PROJECTS), ["Public_Display", "Public_Project_Title", "Public_Description", "Project_Category", "Project_Area", "Number_of_Stories", "Public_Services", "Completion_Year", "Public_Display_Order"]);
}

function initializePublicProjectPortfolio() {
  const headers = ensureProjectPublicHeaders_();
  return { success: true, data: { initialized: true, headers: headers } };
}

function splitPublicList_(value) {
  return String(value || "").split(/\r?\n|\s*[•|]\s*/).map(function(item) { return String(item || "").trim(); }).filter(Boolean);
}

function isPublicProjectImageFile_(file) {
  const name = String(file.getName() || "").toLowerCase();
  const mime = String(file.getMimeType() || "").toLowerCase();
  return mime.indexOf("image/") === 0 && (/\.(jpe?g|png|webp)$/i.test(name) || /image\/(jpeg|jpg|png|webp)/i.test(mime));
}

function projectDriveImageUrl_(file) { return "https://drive.google.com/file/d/" + file.getId() + "/view"; }
function makePublicProjectImageReadable_(file) { try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) {} }

function getExteriorPublicImages_(project) {
  try {
    const rootFolder = getLandViewRootFolder();
    const projectFolder = findExistingProjectFolder(rootFolder, project);
    if (!projectFolder) return { coverImageUrl: "", galleryImages: [] };
    const folders = projectFolder.getFoldersByName("3D Design - Exterior");
    if (!folders.hasNext()) return { coverImageUrl: "", galleryImages: [] };
    const files = folders.next().getFiles();
    const images = [];
    while (files.hasNext()) {
      const file = files.next();
      if (!isPublicProjectImageFile_(file)) continue;
      makePublicProjectImageReadable_(file);
      images.push({ name: String(file.getName() || ""), lowerName: String(file.getName() || "").toLowerCase(), url: projectDriveImageUrl_(file) });
    }
    if (!images.length) return { coverImageUrl: "", galleryImages: [] };
    images.sort(function(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); });
    const frontIndex = images.findIndex(function(image) { return /^front\.(jpe?g|png|webp)$/i.test(image.lowerName); });
    const cover = frontIndex >= 0 ? images[frontIndex] : images[0];
    return { coverImageUrl: cover.url, galleryImages: images.filter(function(image) { return image.url !== cover.url; }).map(function(image) { return image.url; }) };
  } catch (error) { return { coverImageUrl: "", galleryImages: [] }; }
}

function migrateLegacyCertificateRequestsInGateway_() {
  if (typeof getFinanceWorkbook_ !== "function") return;
  const ss = getFinanceWorkbook_();
  const sheet = ss.getSheetByName("Certificate Requests");
  if (!sheet) return;

  const targetHeaders = [
    "Request_ID", "Requester_Role", "Requester_ID", "Project_ID", "Employee_ID",
    "Client_Name", "Mobile", "Certificate_Type", "Category", "Subject", "Details",
    "Status", "Certificate_ID", "Requested_At", "Reviewed_At", "Reviewed_By", "Admin_Note"
  ];

  const lastColumn = Math.max(1, sheet.getLastColumn());
  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  const canonical = targetHeaders.every(function(header, index) { return currentHeaders[index] === header; });
  if (canonical) return;

  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues() : [];

  function detectCategory_(source) {
    const existing = String(source.Category || "").trim().toLowerCase();
    if (existing) return existing;
    const type = String(source.Certificate_Type || "").trim().toLowerCase();
    const subject = String(source.Subject || "").trim().toLowerCase();
    if (type === "employee") return "employee";
    if (type === "building" || subject.indexOf("building") >= 0) return "building";
    if (subject.indexOf("structural") >= 0) return "structural_design";
    if (subject.indexOf("supervision") >= 0) return "supervision";
    return "project";
  }

  const migrated = values.map(function(row) {
    const source = {};
    currentHeaders.forEach(function(header, index) {
      if (header) source[header] = row[index] === undefined ? "" : row[index];
    });
    const category = detectCategory_(source);
    const employeeId = String(source.Employee_ID || "").trim();
    const projectId = String(source.Project_ID || "").trim();
    const requesterRole = String(source.Requester_Role || "").trim().toLowerCase() || (employeeId || category === "employee" ? "employee" : "client");
    const requesterId = String(source.Requester_ID || "").trim() || (requesterRole === "employee" ? employeeId : projectId);
    const record = {
      Request_ID: source.Request_ID || "",
      Requester_Role: requesterRole,
      Requester_ID: requesterId,
      Project_ID: projectId,
      Employee_ID: employeeId,
      Client_Name: source.Client_Name || "",
      Mobile: source.Mobile || "",
      Certificate_Type: source.Certificate_Type || (category === "employee" ? "employee" : category === "building" ? "building" : "project"),
      Category: category,
      Subject: source.Subject || "",
      Details: source.Details || "",
      Status: source.Status || "Pending",
      Certificate_ID: source.Certificate_ID || "",
      Requested_At: source.Requested_At || "",
      Reviewed_At: source.Reviewed_At || "",
      Reviewed_By: source.Reviewed_By || "",
      Admin_Note: source.Admin_Note || ""
    };
    return targetHeaders.map(function(header) { return record[header] === undefined ? "" : record[header]; });
  }).filter(function(row) { return String(row[0] || "").trim(); });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
  if (migrated.length) sheet.getRange(2, 1, migrated.length, targetHeaders.length).setValues(migrated);
  sheet.setFrozenRows(1);
}

function getPublicProjects(params) {
  const trustedSession = trustedPinSessionFromGateway_(params);
  if (trustedSession) return trustedSession;

  if (typeof certificateVerificationFromGateway_ === "function") {
    const result = certificateVerificationFromGateway_(params);
    if (result) return result;
  }
  if (typeof certificateRegistryFromGateway_ === "function") {
    const result = certificateRegistryFromGateway_(params);
    if (result) return result;
  }
  if (typeof certificatePortalFromGateway_ === "function") {
    try {
      migrateLegacyCertificateRequestsInGateway_();
      if (typeof migrateCertificateRequestSheet_ === "function") migrateCertificateRequestSheet_();
    } catch (error) {}
    const result = certificatePortalFromGateway_(params);
    if (result) return result;
  }

  if (String((params && params._clientPortal) || "").trim() === "1" && String((params && params.clientOp) || "").trim().toLowerCase() === "login" && typeof clientPortalLoginV2_ === "function") return clientPortalLoginV2_(params);
  if (String((params && params._clientPortal) || "").trim() === "1" && String((params && params.clientOp) || "workspace").trim().toLowerCase() === "workspace" && typeof clientPortalWorkspaceV2_ === "function") return clientPortalWorkspaceV2_(params);
  if (typeof clientPortalGateway_ === "function") {
    const result = clientPortalGateway_(params);
    if (result) return result;
  }

  const employeeWorkspace = employeeWorkspaceFromGateway_(params);
  if (employeeWorkspace) return employeeWorkspace;

  ensureProjectPublicHeaders_();
  const rows = readSheet(CONFIG.SHEETS.PROJECTS);
  const publicRows = rows.filter(function(project) {
    const visible = normalize(firstValue(project, ["Public_Display", "Public Display", "Show_Publicly", "Show Publicly"]));
    return visible === "true" || visible === "yes" || visible === "1";
  }).map(function(project) {
    const exteriorImages = getExteriorPublicImages_(project);
    return {
      projectId: firstValue(project, ["Project_ID", "Project ID", "ProjectId"]),
      title: firstValue(project, ["Public_Project_Title", "Public Project Title", "Project_Name", "Project Name", "Name"]),
      category: firstValue(project, ["Project_Category", "Project Category", "Project_Type", "Project Type"]),
      location: firstValue(project, ["Location", "Project_Location", "Project Location"]),
      status: firstValue(project, ["Status", "status"]),
      area: firstValue(project, ["Project_Area", "Project Area", "Land_Area", "Land Area"]),
      stories: firstValue(project, ["Number_of_Stories", "Number of Stories", "Floor_Story", "Floor/Story", "Floors"]),
      completionYear: firstValue(project, ["Completion_Year", "Completion Year"]),
      description: firstValue(project, ["Public_Description", "Public Description"]),
      coverImageUrl: exteriorImages.coverImageUrl,
      galleryImages: exteriorImages.galleryImages,
      services: splitPublicList_(firstValue(project, ["Public_Services", "Public Services", "Services"])),
      displayOrder: Number(firstValue(project, ["Public_Display_Order", "Public Display Order"]) || 9999)
    };
  }).sort(function(a, b) { return a.displayOrder - b.displayOrder || String(a.title || "").localeCompare(String(b.title || "")); });
  return { success: true, data: publicRows };
}
