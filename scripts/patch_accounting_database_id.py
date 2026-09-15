from pathlib import Path

MODULAR_FINANCE_ID = "11NY1kI7Ewr0FsMRI3jN4zcVY2XxbGVc2fWPM6UpByCs"
LEGACY_ACCOUNTING_ID = "1e51Mq3hOj9rUH9ugF8SiHe4SYJW3dJ3Bcw9JNgii_bs"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Could not find patch target: {label}")
    return text.replace(old, new, 1)


changed = []

# FinanceSheet.gs: runtime billing -> modular Finance DB; retain old workbook for migration.
p = Path("FinanceSheet.gs")
s = p.read_text(encoding="utf-8")
old = '''function getFinanceWorkbook_() {
  return SpreadsheetApp.openById(FINANCE_WORKBOOK_ID_);
}
'''
new = '''function getLegacyFinanceWorkbook_() {
  return SpreadsheetApp.openById(FINANCE_WORKBOOK_ID_);
}

function getFinanceWorkbook_() {
  return getFinanceDatabase_();
}
'''
s2 = replace_once(s, old, new, "FinanceSheet modular finance workbook")
if s2 != s:
    p.write_text(s2, encoding="utf-8")
    changed.append(str(p))

# FinanceLedger.gs: runtime accounting -> modular Finance DB; retain old ledger for migration.
p = Path("FinanceLedger.gs")
s = p.read_text(encoding="utf-8")
old = f'''function getLandViewFinanceLedger_() {{
  return SpreadsheetApp.openById("{LEGACY_ACCOUNTING_ID}");
}}
'''
new = f'''function getLegacyAccountingLedger_() {{
  return SpreadsheetApp.openById("{LEGACY_ACCOUNTING_ID}");
}}

function getLandViewFinanceLedger_() {{
  return getFinanceDatabase_();
}}
'''
s2 = replace_once(s, old, new, "FinanceLedger modular accounting workbook")
s2 = s2.replace('ledger.getSheetByName("Expenses")', 'ledger.getSheetByName("Accounting Expenses")')
s2 = s2.replace('ledger.insertSheet("Expenses")', 'ledger.insertSheet("Accounting Expenses")')
s2 = s2.replace(
    'var ss = getSpreadsheet();\n  var sheet = ss.getSheetByName(CONFIG.SHEETS.PERMISSIONS)',
    'var ss = getSpreadsheetForSheet_(CONFIG.SHEETS.PERMISSIONS);\n  var sheet = ss.getSheetByName(CONFIG.SHEETS.PERMISSIONS)'
)
s2 = s2.replace(
    'var sourceSheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.EXPENSES);',
    'var sourceSheet = getSpreadsheetForSheet_(CONFIG.SHEETS.EXPENSES).getSheetByName(CONFIG.SHEETS.EXPENSES);'
)
if s2 != s:
    p.write_text(s2, encoding="utf-8")
    changed.append(str(p))

# ZZ_AccountingFinance.gs: admin accounting UI -> modular Finance DB.
p = Path("ZZ_AccountingFinance.gs")
s = p.read_text(encoding="utf-8")
s2 = s.replace(
    '"Accounting Expenses": { sheetName: "Expenses", width: 19 }',
    '"Accounting Expenses": { sheetName: "Accounting Expenses", width: 19 }'
)
s2 = s2.replace(
    'const ss = SpreadsheetApp.openById(LAND_VIEW_ACCOUNTING_LEDGER_ID_);',
    'const ss = getFinanceDatabase_();'
)
if s2 != s:
    p.write_text(s2, encoding="utf-8")
    changed.append(str(p))

# If the admin page still contains the pre-cleanup accounting ID, point it at modular Finance.
OLD_ID = "1E1hCMKn3fGl7LUov1FS60IJNVnZTJUlf6CCO4pFMQw4"
p = Path("app/admin/accounts/page.tsx")
if p.exists():
    s = p.read_text(encoding="utf-8")
    s2 = s.replace(OLD_ID, MODULAR_FINANCE_ID)
    if s2 != s:
        p.write_text(s2, encoding="utf-8")
        changed.append(str(p))

print("Modular finance cutover prepared in:", ", ".join(changed) if changed else "no files")
