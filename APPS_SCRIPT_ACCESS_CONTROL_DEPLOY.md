# LAND VIEW Apps Script access-control deployment

This patch makes the Permissions sheet authoritative for non-admin users.

## 1. Add `AccessControlSecurity.gs` to the Apps Script project
Copy the repository file `AccessControlSecurity.gs` into the live Apps Script project as a new `.gs` file.

## 2. Replace `filterErpRecordsForSession_` in `Code.gs`
```js
function filterErpRecordsForSession_(moduleName, records, session) {
  return secureFilterErpRecordsForSession_(moduleName, records, session);
}
```

## 3. Replace `createErpRecord` in `Code.gs`
```js
function createErpRecord(params) {
  const session = requireSession(params);
  const role = normalizeRoleName(session.role);
  const moduleName = normalizeRoleName(params.module);
  const module = erpModule_(moduleName);

  enforceErpCreatePermission_(moduleName, session);
  ensureErpModule_(module);

  const record = cleanParams(params);
  delete record.module;
  record.Created_At = record.Created_At || new Date().toISOString();
  record.Created_By = session.userId || session.employeeId || session.username || "";

  if (role === "employee") {
    if (moduleName === "attendance" || moduleName === "leave") record.Employee_ID = session.employeeId || "";
    if (moduleName === "tasks" || moduleName === "drawings") record.Assigned_Employee_ID = session.employeeId || "";
    if (moduleName === "expenses") record.Status = "Pending";
  }

  return appendRecord(CONFIG.SHEETS[module.sheet], record, module.prefix, module.id);
}
```

## 4. Replace `updateErpRecord` in `Code.gs`
```js
function updateErpRecord(params) {
  const session = requireSession(params);
  const role = normalizeRoleName(session.role);
  const moduleName = normalizeRoleName(params.module);
  const module = erpModule_(moduleName);
  ensureErpModule_(module);

  enforceErpUpdatePermission_(moduleName, params, session);

  const visible = secureFilterErpRecordsForSession_(moduleName, readSheet(CONFIG.SHEETS[module.sheet]), session);
  const id = String(params.id || "").trim();
  if (!isMainAdminSession_(session) && !visible.some(function(row) { return String(row[module.id] || "").trim() === id; })) {
    throw new Error("Record not found or access denied.");
  }

  const changes = cleanParams(params);
  delete changes.module;
  delete changes.id;

  if (moduleName === "expenses" && !isMainAdminSession_(session)) {
    if (changes.Status !== undefined) {
      changes.Reviewed_By = session.userId || session.employeeId || session.username || "";
      changes.Reviewed_At = new Date().toISOString();
    }
  }

  if (role === "employee" && moduleName !== "expenses") {
    const allowedEmployeeFields = ["Status", "Check_In", "Check_Out", "Work_Hours", "Notes", "Drive_URL", "Comments", "Completed_At", "Submitted_At"];
    Object.keys(changes).forEach(function(key) { if (!allowedEmployeeFields.includes(key)) delete changes[key]; });
  }

  if (role === "client") {
    const allowedClientFields = ["Status", "Decision_Notes", "Decided_At"];
    Object.keys(changes).forEach(function(key) { if (!allowedClientFields.includes(key)) delete changes[key]; });
  }

  return updateGeneric(CONFIG.SHEETS[module.sheet], changes, [module.id], id);
}
```

## 5. Expense headers
Add these headers to `ERP_MODULES.expenses.headers` after `Status` if not already present:

```js
"Reviewed_By", "Reviewed_At", "Notes"
```

Recommended final expense headers:

```js
["Expense_ID", "Project_ID", "Expense_Date", "Category", "Description", "Amount", "Payment_Method", "Reference", "Status", "Reviewed_By", "Reviewed_At", "Notes", "Created_At", "Created_By"]
```

## 6. Important role rule
Only role `admin` bypasses granular permissions. `manager`, `accounts`, and `employee` accounts are controlled by the permission matrix.

Do not change the user's own account away from `admin`.

## 7. Deploy
In Apps Script: **Deploy → Manage deployments → Edit → New version → Deploy**.

After deployment, verify:
1. Admin can access everything.
2. Employee without `expenses.submit` cannot submit expenses.
3. Employee with `expenses.submit` can submit Pending expenses.
4. Employee cannot see other employees' expenses without `expenses.view_all` or `expenses.approve`.
5. Boss with `expenses.approve` can approve/reject and gets recorded in `Reviewed_By` / `Reviewed_At`.
6. Removing a permission immediately blocks the matching backend action.
