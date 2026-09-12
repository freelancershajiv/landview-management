from pathlib import Path

path = Path("Code.gs")
s = path.read_text(encoding="utf-8")

router_anchor = '    case "getFinanceSheet": return getFinanceSheet(params);\n'
router_block = (
    '    case "getFinanceSheet": return getFinanceSheet(params);\n'
    '    case "getChairmanPendingApprovals": return getChairmanPendingApprovals(params);\n'
    '    case "reviewChairmanPendingApproval": return reviewChairmanPendingApproval(params);\n'
)
if 'case "getChairmanPendingApprovals"' not in s:
    if router_anchor not in s:
        raise SystemExit("Finance router anchor not found")
    s = s.replace(router_anchor, router_block, 1)

shared_old = '  const sharedAuthenticatedActions = ["getSession", "logout"];'
shared_new = '  const sharedAuthenticatedActions = ["getSession", "logout", "getChairmanPendingApprovals", "reviewChairmanPendingApproval"];'
if shared_old in s:
    s = s.replace(shared_old, shared_new, 1)
elif '"getChairmanPendingApprovals"' not in s:
    raise SystemExit("Shared authenticated action anchor not found")

path.write_text(s, encoding="utf-8")
print("Chairman approval routes patched successfully")
