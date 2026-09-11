/* LAND VIEW — CLIENT PORTAL LOGIN V2
 * Robust Project ID + mobile matching across Finance File List, Finance Summary,
 * and the Management Projects sheet. This avoids requiring a separate client account.
 */

function clientPortalLoginPhoneEqual_(a, b) {
  const aa = clientPortalPhone_(a);
  const bb = clientPortalPhone_(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  // Accept equivalent Bangladesh numbers when one source contains an extra country/trunk prefix.
  const a10 = aa.slice(-10);
  const b10 = bb.slice(-10);
  return a10.length === 10 && b10.length === 10 && a10 === b10;
}

function clientPortalLoginPhonesFromRow_(row) {
  const keys = [
    "Contact", "CONTACT", "Contact Number", "Contact_Number", "Contact No", "Contact_No",
    "Mobile", "MOBILE", "Mobile Number", "Mobile_Number", "Mobile No", "Mobile_No",
    "Phone", "PHONE", "Phone Number", "Phone_Number", "Phone No", "Phone_No",
    "Client Phone", "Client_Phone", "Client Mobile", "Client_Mobile", "Client Contact", "Client_Contact",
    "Whatsapp", "WhatsApp", "WhatsApp Number", "WhatsApp_Number"
  ];
  const phones = [];
  keys.forEach(function(key) {
    const raw = row && row[key];
    const phone = clientPortalPhone_(raw);
    if (phone && phones.indexOf(phone) < 0) phones.push(phone);
  });
  return phones;
}

function clientPortalLoginCandidateRows_(projectId) {
  const id = normalizeFinanceWorkflowProjectId_(projectId);
  const rows = [];

  // Finance workbook is the primary project/client source.
  try {
    const finance = getFinanceWorkbook_();
    ["File List", "Summary"].forEach(function(sheetName) {
      clientPortalRows_(finance, sheetName).forEach(function(row) {
        if (clientPortalProjectId_(row) === id) rows.push({ row: row, source: sheetName });
      });
    });
  } catch (error) {}

  // Management Projects is a secondary source and commonly contains Phone_Number.
  try {
    const projects = readSheet(CONFIG.SHEETS.PROJECTS) || [];
    projects.forEach(function(row) {
      const rowId = normalizeFinanceWorkflowProjectId_(firstValue(row, ["Project_ID", "Project ID", "ProjectId", "FILE ID", "File ID"]));
      if (rowId === id) rows.push({ row: row, source: "Projects" });
    });
  } catch (error) {}

  return rows;
}

function clientPortalLoginV2_(params) {
  const projectId = normalizeFinanceWorkflowProjectId_(params.projectId || params.Project_ID || params.userId || "");
  const mobile = clientPortalPhone_(params.mobile || params.phone || params.Mobile || params.password || "");
  if (!projectId || !mobile) return { success: false, error: "Project ID and mobile number are required." };

  const candidates = clientPortalLoginCandidateRows_(projectId);
  if (!candidates.length) {
    return { success: false, error: "Project ID or mobile number did not match our records." };
  }

  let matched = null;
  let clientName = projectId;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const name = clientPortalClientName_(candidate.row, "");
    if (name && clientName === projectId) clientName = name;
    const phones = clientPortalLoginPhonesFromRow_(candidate.row);
    const ok = phones.some(function(phone) { return clientPortalLoginPhoneEqual_(phone, mobile); });
    if (ok) {
      matched = candidate;
      if (name) clientName = name;
      break;
    }
  }

  if (!matched) {
    return { success: false, error: "Project ID or mobile number did not match our records." };
  }

  const virtualUser = {
    User_ID: "CLIENT-" + projectId,
    Username: projectId,
    Name: clientName,
    Role: "Client",
    Project_IDs: projectId
  };
  const token = createSession(virtualUser);
  const safeUser = sanitizeUser(virtualUser);
  safeUser.projectIds = projectId;
  safeUser.Project_IDs = projectId;
  return {
    success: true,
    data: {
      token: token,
      user: safeUser,
      projectId: projectId,
      matchedSource: matched.source
    }
  };
}
