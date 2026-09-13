from pathlib import Path

path = Path("Code.gs")
s = path.read_text(encoding="utf-8")

old_matcher = '''    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    const identifierMatches = normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);
'''

new_matcher = '''    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowEmployeeId = normalize(firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId", "employeeId"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    const chairmanAliasMatches = normalizedIdentifier === normalize("EMP-0001") && chairmanIdentityMatches_(user);
    const identifierMatches = normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || normalizedIdentifier === rowEmployeeId || chairmanAliasMatches || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);
'''

if 'const chairmanAliasMatches = normalizedIdentifier === normalize("EMP-0001")' not in s:
    if old_matcher not in s:
        raise SystemExit("loginUser matcher anchor not found")
    s = s.replace(old_matcher, new_matcher, 1)

old_name_match = '''    name.indexOf("jamal ahmed bhuiyan") >= 0 ||
    name.indexOf("jamal rony") >= 0;'''
new_name_match = '''    name.indexOf("jamal ahmed bhuiyan") >= 0 ||
    name.indexOf("jamal ahamed bhuiyan") >= 0 ||
    name.indexOf("jamal rony") >= 0;'''
if 'name.indexOf("jamal ahamed bhuiyan") >= 0' not in s:
    if old_name_match not in s:
        raise SystemExit("chairmanIdentityMatches_ name anchor not found")
    s = s.replace(old_name_match, new_name_match, 1)

path.write_text(s, encoding="utf-8")
print("EMP-0001 login alias and Jamal Ahamed identity patched successfully")
