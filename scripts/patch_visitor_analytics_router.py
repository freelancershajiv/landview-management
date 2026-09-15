from pathlib import Path

path = Path("Code.gs")
text = path.read_text(encoding="utf-8")
original = text

case_anchor = '''    case "getPublicProjects":\n      return getPublicProjects(params);\n'''
case_insert = case_anchor + '''\n    case "trackVisitorEvent":\n      return trackVisitorEvent(params);\n\n    case "getVisitorAnalytics":\n      return getVisitorAnalytics(params);\n'''

if 'case "trackVisitorEvent"' not in text:
    if case_anchor not in text:
        raise SystemExit("Could not find getPublicProjects action router anchor in Code.gs")
    text = text.replace(case_anchor, case_insert, 1)

public_anchor = '''  "getPublicTeam",\n  "getPublicProjects",\n  "getPublicBillingVerification"\n];'''
public_insert = '''  "getPublicTeam",\n  "getPublicProjects",\n  "getPublicBillingVerification",\n  "trackVisitorEvent"\n];'''

if '"trackVisitorEvent"\n];' not in text:
    if public_anchor not in text:
        raise SystemExit("Could not find publicActions anchor in Code.gs")
    text = text.replace(public_anchor, public_insert, 1)

if text != original:
    path.write_text(text, encoding="utf-8")
    print("Patched Code.gs for visitor analytics routing.")
else:
    print("Code.gs visitor analytics routing is already installed.")
