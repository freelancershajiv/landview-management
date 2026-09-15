/* LAND VIEW temporary owner direct-access bridge.
 *
 * Purpose:
 * - Keep the normal login page for employees and clients only.
 * - Disable normal password login for admin/manager/accounts roles for now.
 * - Allow the Next.js owner-access route to mint a fresh admin session after
 *   the route has validated its private bearer link.
 *
 * Security:
 * handleAction("login", ...) still runs authorizeProxyRequest_() before this
 * function, so _ownerMagic can only be honored when the request came through
 * the trusted Vercel proxy with the correct PROXY_SHARED_SECRET.
 */

function loginUser(params) {
  params = params || {};

  // Temporary direct owner access. The public browser never receives the
  // Apps Script proxy secret; the Next.js owner-access route validates the
  // private bearer link and then makes this trusted server-to-server request.
  if (String(params._ownerMagic || "") === "1") {
    const directUser = {
      User_ID: "OWNER-DIRECT",
      Username: "owner-direct",
      Name: "LAND VIEW Administration",
      Role: "admin",
      Employee_ID: ""
    };
    const token = createSession(directUser, params);
    const safeUser = {
      userId: "OWNER-DIRECT",
      username: "owner-direct",
      name: "LAND VIEW Administration",
      role: "admin",
      employeeId: "",
      User_ID: "OWNER-DIRECT",
      Username: "owner-direct",
      Name: "LAND VIEW Administration",
      Role: "admin",
      Employee_ID: ""
    };
    try {
      const meta = lvMeta_(params);
      auditSecurityEvent_({ userId: safeUser.userId, role: safeUser.role }, "OWNER_DIRECT_LOGIN", meta.deviceId || "", "SUCCESS", [meta.ipAddress, meta.city, meta.country, meta.deviceName].filter(Boolean).join(" | "));
    } catch (e) {}
    return { success: true, data: { token: token, user: safeUser } };
  }

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

  // Admin-family password login is intentionally paused while the admin login
  // experience is being redesigned. Employees and clients continue normally.
  if (["admin", "manager", "accounts"].includes(role)) {
    return { success: false, message: "Admin login is temporarily disabled. Use the private owner access link." };
  }

  const token = createSession(foundUser, params);
  const safeUser = sanitizeUser(foundUser);
  const meta = lvMeta_(params);
  auditSecurityEvent_({ userId: safeUser.userId, role: safeUser.role }, "LOGIN", meta.deviceId, "SUCCESS", [meta.ipAddress, meta.city, meta.country, meta.deviceName].filter(Boolean).join(" | "));
  return { success: true, data: { token: token, user: safeUser } };
}
