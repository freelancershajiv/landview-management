from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Apps Script: routes + canonical chairman identity (Jamal Ahmed Bhuiyan = EMP-0001)
# -----------------------------------------------------------------------------
path = "Code.gs"
s = read(path)

router_anchor = '    case "getFinanceSheet": return getFinanceSheet(params);\n'
router_block = (
    '    case "getFinanceSheet": return getFinanceSheet(params);\n'
    '    case "getChairmanPendingApprovals": return getChairmanPendingApprovals(params);\n'
    '    case "reviewChairmanPendingApproval": return reviewChairmanPendingApproval(params);\n'
)
if 'case "getChairmanPendingApprovals"' not in s:
    s = replace_once(s, router_anchor, router_block, "Finance router")

shared_old = '  const sharedAuthenticatedActions = ["getSession", "logout"];'
shared_new = '  const sharedAuthenticatedActions = ["getSession", "logout", "getChairmanPendingApprovals", "reviewChairmanPendingApproval"];'
if shared_old in s:
    s = s.replace(shared_old, shared_new, 1)
elif '"getChairmanPendingApprovals"' not in s:
    raise SystemExit("Shared authenticated action anchor not found")

identity_helpers = r'''
function chairmanIdentityMatches_(identity) {
  const source = identity || {};
  const employeeId = String(firstValue(source, ["employeeId", "Employee_ID", "Employee ID", "EmployeeId"]) || "").trim().toUpperCase();
  const userId = String(firstValue(source, ["userId", "User_ID", "User ID", "UserId"]) || "").trim().toUpperCase();
  const username = String(firstValue(source, ["username", "Username", "User_Name", "User Name"]) || "").trim().toLowerCase();
  const name = String(firstValue(source, ["name", "Name", "Employee_Name", "Employee Name"]) || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return employeeId === "EMP-0001" ||
    userId === "EMP-0001" ||
    username === "emp-0001" ||
    name.indexOf("jamal ahmed bhuiyan") >= 0 ||
    name.indexOf("jamal rony") >= 0;
}

function canonicalEmployeeIdForIdentity_(identity) {
  const source = identity || {};
  const existing = String(firstValue(source, ["employeeId", "Employee_ID", "Employee ID", "EmployeeId"]) || "").trim();
  return chairmanIdentityMatches_(source) ? "EMP-0001" : existing;
}

'''
create_session_anchor = 'function createSession(user) {\n'
if 'function canonicalEmployeeIdForIdentity_(' not in s:
    if create_session_anchor not in s:
        raise SystemExit("createSession anchor not found")
    s = s.replace(create_session_anchor, identity_helpers + create_session_anchor, 1)

s = s.replace(
    '    employeeId: String(firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId"]) || ""),',
    '    employeeId: canonicalEmployeeIdForIdentity_(user),',
    1,
)

read_session_anchor = '  const now = Date.now();\n  const idleMs = Number(CONFIG.SESSION_IDLE_MINUTES || 45) * 60 * 1000;'
read_session_new = '''  const now = Date.now();
  const canonicalEmployeeId = canonicalEmployeeIdForIdentity_(session);
  if (canonicalEmployeeId && canonicalEmployeeId !== String(session.employeeId || "").trim()) {
    session.employeeId = canonicalEmployeeId;
    props.setProperty(key, JSON.stringify(session));
  }
  const idleMs = Number(CONFIG.SESSION_IDLE_MINUTES || 45) * 60 * 1000;'''
if 'const canonicalEmployeeId = canonicalEmployeeIdForIdentity_(session);' not in s:
    s = replace_once(s, read_session_anchor, read_session_new, "readSession canonicalization")

s = s.replace(
    '  const employeeId = firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId"]);',
    '  const employeeId = canonicalEmployeeIdForIdentity_(user);',
    1,
)
write(path, s)


# -----------------------------------------------------------------------------
# Next.js proxy: allow the dedicated chairman queue actions.
# -----------------------------------------------------------------------------
path = "app/api/landview/route.ts"
s = read(path)
if '  "getChairmanPendingApprovals",' not in s:
    s = replace_once(
        s,
        '  "getErpRecords",\n]);',
        '  "getErpRecords",\n  "getChairmanPendingApprovals",\n]);',
        "GET action set",
    )
if '  "reviewChairmanPendingApproval",' not in s:
    s = replace_once(
        s,
        '  "updateErpRecord",\n]);',
        '  "updateErpRecord",\n  "reviewChairmanPendingApproval",\n]);',
        "POST action set",
    )
write(path, s)


# -----------------------------------------------------------------------------
# Employee portal: make Jamal Ahmed Bhuiyan and EMP-0001 the same chairman UI.
# -----------------------------------------------------------------------------
path = "components/employee-portal-shell.tsx"
s = read(path)
s = s.replace(
    '      setIsChairman(id === "EMP-0001" || name.includes("jamal rony"));',
    '      setIsChairman(id === "EMP-0001" || name.includes("jamal rony") || name.includes("jamal ahmed bhuiyan"));',
    1,
)
write(path, s)


# -----------------------------------------------------------------------------
# Chairman approvals screen: use the dedicated backend queue, not generic
# employee expense reads (which intentionally hide other employees' records).
# -----------------------------------------------------------------------------
path = "components/chairman-expense-approval.tsx"
s = read(path)

s = s.replace(
    '  const isChairman = employeeId === CHAIRMAN_ID || name.includes("jamal rony");',
    '  const isChairman = employeeId === CHAIRMAN_ID || name.includes("jamal rony") || name.includes("jamal ahmed bhuiyan");',
    1,
)

helper_anchor = 'export default function ChairmanExpenseApproval() {'
api_helpers = r'''async function chairmanQueueApi() {
  const response = await fetch("/api/landview?action=getChairmanPendingApprovals", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || json?.message || "Could not load chairman approvals."));
  }
  return (json.data || []) as Row[];
}

async function chairmanReviewApi(id: string, status: "Approved" | "Rejected", note: string) {
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reviewChairmanPendingApproval", id, status, note }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || json?.message || `Could not mark ${id} as ${status}.`));
  }
  return json.data || {};
}

'''
if 'async function chairmanQueueApi()' not in s:
    if helper_anchor not in s:
        raise SystemExit("Chairman component export anchor not found")
    s = s.replace(helper_anchor, api_helpers + helper_anchor, 1)

load_start = s.find('  async function loadQueue() {')
load_end = s.find('\n  useEffect(() => {', load_start)
if load_start < 0 or load_end < 0:
    raise SystemExit("Chairman loadQueue block not found")
new_load = '''  async function loadQueue() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const expenses = await chairmanQueueApi();
      setRows(expenses || []);
      setMessage(`Loaded ${expenses.length} September 2026 expense record${expenses.length === 1 ? "" : "s"} for EMP-0001 review.`);
    } catch (e: any) {
      setError(e?.message || "Could not load the September 2026 approval queue.");
    } finally {
      setLoading(false);
    }
  }
'''
s = s[:load_start] + new_load + s[load_end:]

s = s.replace(
    '        if (id === CHAIRMAN_ID || n.includes("jamal rony")) void loadQueue();',
    '        if (id === CHAIRMAN_ID || n.includes("jamal rony") || n.includes("jamal ahmed bhuiyan")) void loadQueue();',
    1,
)

decide_start = s.find('  async function decide(row: Row, status: "Approved" | "Rejected") {')
decide_end = s.find('\n  if (!sessionReady || !isChairman) return null;', decide_start)
if decide_start < 0 or decide_end < 0:
    raise SystemExit("Chairman decide block not found")
new_decide = '''  async function decide(row: Row, status: "Approved" | "Rejected") {
    const id = idOf(row);
    if (!id) return;
    setBusy(id); setError(""); setMessage("");
    const now = new Date().toISOString();
    const reviewNote = text(notes[id]) || `${status} by EMP-0001 · Engr. Jamal Ahmed Bhuiyan`;
    try {
      await chairmanReviewApi(id, status, reviewNote);
      setRows((current) => current.map((item) => idOf(item) === id ? {
        ...item,
        Status: status,
        Approval_Status: status,
        Approved_By: status === "Approved" ? CHAIRMAN_ID : "",
        Approved_At: status === "Approved" ? now : "",
        Reviewed_By: CHAIRMAN_ID,
        Reviewed_At: now,
        Review_Notes: reviewNote,
      } : item));
      setMessage(`${id} ${status.toLowerCase()} by EMP-0001.`);
    } catch (e: any) {
      setError(e?.message || `Could not mark ${id} as ${status}.`);
    } finally {
      setBusy("");
    }
  }
'''
s = s[:decide_start] + new_decide + s[decide_end:]
write(path, s)

print("Chairman identity and September approval patches applied successfully")
