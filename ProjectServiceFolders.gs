/**
 * LAND VIEW — Project Service Folder Module
 */

var PROJECT_SERVICE_FOLDERS = [
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

function isAllowedProjectServiceFolder_(name) {
  var target = String(name || "").trim();
  return PROJECT_SERVICE_FOLDERS.indexOf(target) >= 0;
}

function ensureProjectServiceFolders_(projectId) {
  var id = String(projectId || "").trim();
  if (!id) throw new Error("Project ID is required.");

  var drive = ensureProjectDriveStructure(id);
  var projectFolder = drive.projectFolder;
  var folders = PROJECT_SERVICE_FOLDERS.map(function(name) {
    var folder = getOrCreateChildFolder(projectFolder, name);
    return { name: name, id: folder.getId(), url: folder.getUrl(), folder: folder };
  });

  return {
    projectId: id,
    projectFolderId: projectFolder.getId(),
    projectFolderUrl: projectFolder.getUrl(),
    folders: folders
  };
}

function getProjectServiceFolders(params) {
  var session = requireSession(params);
  var projectId = String(params.projectId || params.Project_ID || "").trim();
  assertProjectAccess(session, projectId);

  var result = ensureProjectServiceFolders_(projectId);
  return {
    success: true,
    data: {
      projectId: result.projectId,
      projectFolderId: result.projectFolderId,
      projectFolderUrl: result.projectFolderUrl,
      folders: result.folders.map(function(item) {
        return { name: item.name, id: item.id, url: item.url };
      })
    }
  };
}

function isPortfolioExteriorImage_(folderName, fileName, mimeType) {
  if (String(folderName || "") !== "3D Design - Exterior") return false;
  var name = String(fileName || "").toLowerCase();
  var mime = String(mimeType || "").toLowerCase();
  return /\.(jpe?g|png|webp)$/i.test(name) || /image\/(jpeg|jpg|png|webp)/i.test(mime);
}

function uploadProjectServiceFile(params) {
  var session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  var projectId = String(params.projectId || params.Project_ID || "").trim();
  var folderName = String(params.folderName || params.Folder_Name || "").trim();
  var fileName = String(params.fileName || params.File_Name || "").trim();
  var mimeType = String(params.mimeType || params.Mime_Type || "application/octet-stream").trim();
  var base64 = String(params.base64 || params.fileBase64 || "").trim();

  if (!projectId) throw new Error("Project ID is required.");
  if (!isAllowedProjectServiceFolder_(folderName)) throw new Error("Invalid project folder.");
  if (!fileName) throw new Error("File name is required.");
  if (!base64) throw new Error("File data is required.");

  assertProjectAccess(session, projectId);

  var result = ensureProjectServiceFolders_(projectId);
  var target = result.folders.filter(function(item) { return item.name === folderName; })[0];
  if (!target) throw new Error("Project folder not found.");

  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (error) {
    throw new Error("Invalid file data.");
  }

  var safeName = sanitizeFileName(fileName) || "LAND VIEW File";
  var blob = Utilities.newBlob(bytes, mimeType || "application/octet-stream", safeName);
  var file = target.folder.createFile(blob);

  /* Exterior render images are intended for the public portfolio. */
  if (isPortfolioExteriorImage_(folderName, safeName, mimeType)) {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      /* Workspace policies may prevent link sharing. */
    }
  }

  try {
    appendRecord(CONFIG.SHEETS.DOCUMENTS, {
      Project_ID: projectId,
      Document_Name: safeName,
      Document_Type: folderName,
      Document_Date: new Date(),
      File_URL: file.getUrl(),
      Folder_ID: target.id,
      Folder_URL: target.url,
      Client_Visible: "FALSE"
    }, "DOC-", "Document_ID");
  } catch (error) {}

  return {
    success: true,
    data: {
      projectId: projectId,
      folderName: folderName,
      folderId: target.id,
      folderUrl: target.url,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      size: bytes.length
    }
  };
}

function initializeProjectServiceFolders() {
  var projects = readSheet(CONFIG.SHEETS.PROJECTS);
  var results = [];
  projects.forEach(function(project) {
    var projectId = String(firstValue(project, ["Project_ID", "Project ID", "ProjectId"]) || "").trim();
    if (!projectId) return;
    try {
      var result = ensureProjectServiceFolders_(projectId);
      results.push({ projectId: projectId, success: true, folders: result.folders.length });
    } catch (error) {
      results.push({ projectId: projectId, success: false, error: error.message || String(error) });
    }
  });
  return results;
}
