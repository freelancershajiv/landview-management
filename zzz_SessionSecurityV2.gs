/* LAND VIEW Session Security V2
 * Loaded after the base backend. Adds device/IP/location audit data,
 * 30-minute idle expiry, 8-hour absolute expiry, active-session listing,
 * and remote session termination without changing the public action router.
 */

const LV_SESSION_IDLE_MINUTES_ = 30;
const LV_SESSION_ABSOLUTE_HOURS_ = 8;
const LV_SESSION_TOUCH_MINUTES_ = 2;
const LV_LOGIN_SESSION_SHEET_ = "Login Sessions";

function lvSessionSheet_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(LV_LOGIN_SESSION_SHEET_);
  if (!sheet) sheet = ss.insertSheet(LV_LOGIN_SESSION_SHEET_);
  const headers = ["Session_ID","User_ID","Username","Name","Role","Device_ID","Device_Name","Browser","OS","IP_Address","City","Region","Country","Latitude","Longitude","Created_At","Last_Activity","Expires_At","Status","Logout_At","Logout_Reason"];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  else ensureHeaders_(sheet, headers);
  return sheet;
}

function lvSessionId_(token) {
  return sha256Hex_(String(token || "") + "|login-session").slice(0, 24);
}

function lvMeta_(params) {
  params = params || {};
  return {
    deviceId: String(params.deviceId || "").slice(0, 120),
    deviceName: String(params.deviceName || "").slice(0, 160),
    browser: String(params.browser || "").slice(0, 100),
    os: String(params.os || "").slice(0, 100),
    ipAddress: String(params.ipAddress || params._clientIp || "").slice(0, 100),
    city: String(params.city || "").slice(0, 100),
    region: String(params.region || "").slice(0, 100),
    country: String(params.country || "").slice(0, 100),
    latitude: String(params.latitude || "").slice(0, 40),
    longitude: String(params.longitude || "").slice(0, 40)
  };
}

function lvAppendSessionAudit_(session) {
  try {
    lvSessionSheet_().appendRow([
      session.sessionId || "", session.userId || "", session.username || "", session.name || "", session.role || "",
      session.deviceId || "", session.deviceName || "", session.browser || "", session.os || "", session.ipAddress || "",
      session.city || "", session.region || "", session.country || "", session.latitude || "", session.longitude || "",
      new Date(Number(session.createdAt || Date.now())), new Date(Number(session.lastSeenAt || Date.now())),
      new Date(Number(session.expiresAt || Date.now())), "Active", "", ""
    ]);
  } catch (e) {}
}

function lvUpdateSessionAudit_(sessionId, updates) {
  try {
    const sheet = lvSessionSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    const headers = values[0].map(String);
    const idCol = headers.indexOf("Session_ID");
    for (let r = values.length - 1; r >= 1; r--) {
      if (String(values[r][idCol] || "") !== String(sessionId || "")) continue;
      Object.keys(updates || {}).forEach(function(key) {
        const c = headers.indexOf(key);
        if (c >= 0) sheet.getRange(r + 1, c + 1).setValue(updates[key]);
      });
      return;
    }
  } catch (e) {}
}

function createSession(user, metaParams) {
  const token = Utilities.getUuid() + "-" + Utilities.getUuid() + "-" + Utilities.getUuid();
  const now = Date.now();
  const meta = lvMeta_(metaParams);
  const session = {
    sessionId: lvSessionId_(token),
    userId: String(firstValue(user, ["User_ID", "User ID", "UserId"]) || ""),
    username: String(firstValue(user, ["Username", "username", "User_Name", "User Name"]) || ""),
    name: String(firstValue(user, ["Name", "name"]) || ""),
    role: String(firstValue(user, ["Role", "role"]) || ""),
    employeeId: canonicalEmployeeIdForIdentity_(user),
    projectIds: String(firstValue(user, ["Project_IDs", "Project IDs", "Projects", "Project_ID", "Project ID"]) || ""),
    deviceId: meta.deviceId, deviceName: meta.deviceName, browser: meta.browser, os: meta.os,
    ipAddress: meta.ipAddress, city: meta.city, region: meta.region, country: meta.country,
    latitude: meta.latitude, longitude: meta.longitude,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + LV_SESSION_ABSOLUTE_HOURS_ * 60 * 60 * 1000
  };
  PropertiesService.getScriptProperties().setProperty(sessionPropertyKey_(token), JSON.stringify(session));
  lvAppendSessionAudit_(session);
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
  try { session = JSON.parse(raw); } catch (e) { props.deleteProperty(key); return null; }

  const now = Date.now();
  const idleMs = LV_SESSION_IDLE_MINUTES_ * 60 * 1000;
  const expiredAbsolute = !session.expiresAt || now > Number(session.expiresAt);
  const expiredIdle = session.lastSeenAt && now - Number(session.lastSeenAt) > idleMs;
  if (expiredAbsolute || expiredIdle) {
    props.deleteProperty(key);
    lvUpdateSessionAudit_(session.sessionId || lvSessionId_(cleanToken), {
      Status: "Expired", Logout_At: new Date(), Logout_Reason: expiredIdle ? "Idle timeout" : "Maximum session duration"
    });
    return null;
  }

  const canonicalEmployeeId = canonicalEmployeeIdForIdentity_(session);
  if (canonicalEmployeeId) session.employeeId = canonicalEmployeeId;
  const touchMs = LV_SESSION_TOUCH_MINUTES_ * 60 * 1000;
  if (!session.lastSeenAt || now - Number(session.lastSeenAt) >= touchMs) {
    session.lastSeenAt = now;
    props.setProperty(key, JSON.stringify(session));
    lvUpdateSessionAudit_(session.sessionId || lvSessionId_(cleanToken), { Last_Activity: new Date(now) });
  }
  return session;
}

function requireSession(params) {
  const token = String((params && params.token) || "").trim();
  if (!token) throw new Error("Unauthorized");
  const session = readSession(token);
  if (!session) throw new Error("Unauthorized");
  return session;
}

function lvListSessions_(requestingSession) {
  if (!isAdminRole(requestingSession.role)) throw new Error("Access denied.");
  const props = PropertiesService.getScriptProperties().getProperties();
  const rows = [];
  Object.keys(props).forEach(function(key) {
    if (key.indexOf("SESSION_") !== 0) return;
    try {
      const s = JSON.parse(props[key]);
      if (!s || !s.userId) return;
      rows.push({
        sessionId: s.sessionId || "", userId: s.userId || "", username: s.username || "", name: s.name || "", role: s.role || "",
        deviceId: s.deviceId || "", deviceName: s.deviceName || "", browser: s.browser || "", os: s.os || "", ipAddress: s.ipAddress || "",
        location: [s.city, s.region, s.country].filter(Boolean).join(", "), createdAt: s.createdAt || 0, lastSeenAt: s.lastSeenAt || 0,
        expiresAt: s.expiresAt || 0, current: String(s.sessionId || "") === String(requestingSession.sessionId || "")
      });
    } catch (e) {}
  });
  rows.sort(function(a,b){ return Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0); });
  return rows;
}

function lvTerminateSession_(requestingSession, targetSessionId) {
  if (!isAdminRole(requestingSession.role)) throw new Error("Access denied.");
  const target = String(targetSessionId || "").trim();
  if (!target) throw new Error("Session ID is required.");
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let removed = false;
  Object.keys(all).forEach(function(key) {
    if (key.indexOf("SESSION_") !== 0) return;
    try {
      const s = JSON.parse(all[key]);
      if (String(s.sessionId || "") === target) { props.deleteProperty(key); removed = true; }
    } catch (e) {}
  });
  if (removed) lvUpdateSessionAudit_(target, { Status: "Terminated", Logout_At: new Date(), Logout_Reason: "Admin revoked session" });
  return removed;
}

function getSession(params) {
  const token = String((params && params.token) || "").trim();
  const session = readSession(token);
  if (!session) return { success: false, message: "Session expired." };
  if (String(params && params.sessionMode || "") === "list") {
    return { success: true, data: { sessions: lvListSessions_(session), policy: { idleMinutes: LV_SESSION_IDLE_MINUTES_, absoluteHours: LV_SESSION_ABSOLUTE_HOURS_ } } };
  }
  return { success: true, data: {
    authenticated: true,
    session: { sessionId: session.sessionId || "", createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, idleMinutes: LV_SESSION_IDLE_MINUTES_, absoluteHours: LV_SESSION_ABSOLUTE_HOURS_ },
    user: { userId: session.userId, username: session.username, name: session.name, role: session.role, employeeId: session.employeeId || "", projectIds: session.projectIds || "", User_ID: session.userId, Username: session.username, Name: session.name, Role: session.role, Employee_ID: session.employeeId || "", Project_IDs: session.projectIds || "" }
  }};
}

function logoutUser(params) {
  const token = String((params && params.token) || "").trim();
  const session = token ? readSession(token) : null;
  const mode = String((params && params.sessionMode) || "");
  if (mode === "terminate") {
    if (!session) throw new Error("Unauthorized");
    const removed = lvTerminateSession_(session, params.sessionId);
    return { success: true, data: { terminated: removed } };
  }
  if (token) PropertiesService.getScriptProperties().deleteProperty(sessionPropertyKey_(token));
  if (session) {
    lvUpdateSessionAudit_(session.sessionId || lvSessionId_(token), { Status: "Logged out", Logout_At: new Date(), Logout_Reason: String(params.logoutReason || "Manual logout") });
    auditSecurityEvent_(session, "LOGOUT", "", "SUCCESS", String(params.logoutReason || "Manual logout"));
  }
  return { success: true, data: { loggedOut: true } };
}

function loginUser(params) {
  const identifier = String(params.userId || params.User_ID || params.username || params.Username || "").trim();
  const password = String(params.password || params.Password || "");
  if (!identifier || !password) return { success: false, message: "Invalid User ID or password." };
  try { assertLoginAllowed_(identifier); }
  catch (e) { auditSecurityEvent_(null, "LOGIN_BLOCKED", sha256Hex_(normalize(identifier)), "DENIED", "Rate limit"); return { success: false, message: e.message || "Too many failed sign-in attempts. Try again later." }; }

  const users = readSheet(CONFIG.SHEETS.USERS);
  const normalizedIdentifier = normalize(identifier);
  const phoneIdentifier = normalizePhoneIdentifier(identifier);
  let foundUser = null;
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowEmployeeId = normalize(firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId", "employeeId"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    const chairmanAliasMatches = normalizedIdentifier === normalize("EMP-0001") && chairmanIdentityMatches_(user);
    const identifierMatches = normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || normalizedIdentifier === rowEmployeeId || chairmanAliasMatches || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);
    if (identifierMatches && isActiveUser(user) && verifyUserPassword_(user, password)) { foundUser = user; break; }
  }
  if (!foundUser) { registerFailedLogin_(identifier); auditSecurityEvent_(null, "LOGIN_FAILED", sha256Hex_(normalize(identifier)), "DENIED", "Invalid credentials"); return { success: false, message: "Invalid User ID or password." }; }
  clearLoginGuard_(identifier);
  if (userPasswordNeedsUpgrade_(foundUser)) migrateUserPasswordRow_(foundUser, password);
  const role = normalizeRoleName(firstValue(foundUser, ["Role", "role"]));
  if (!["admin", "manager", "accounts", "employee", "client"].includes(role)) return { success: false, message: "This account does not have a supported LAND VIEW role." };
  const token = createSession(foundUser, params);
  const safeUser = sanitizeUser(foundUser);
  const meta = lvMeta_(params);
  auditSecurityEvent_({ userId: safeUser.userId, role: safeUser.role }, "LOGIN", meta.deviceId, "SUCCESS", [meta.ipAddress, meta.city, meta.country, meta.deviceName].filter(Boolean).join(" | "));
  return { success: true, data: { token: token, user: safeUser } };
}
