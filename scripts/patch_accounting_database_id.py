from pathlib import Path

OLD_ID = "1E1hCMKn3fGl7LUov1FS60IJNVnZTJUlf6CCO4pFMQw4"
NEW_ID = "1e51Mq3hOj9rUH9ugF8SiHe4SYJW3dJ3Bcw9JNgii_bs"

TARGETS = [
    Path("FinanceLedger.gs"),
    Path("ZZ_AccountingFinance.gs"),
    Path("app/admin/accounts/page.tsx"),
]

changed = []
for path in TARGETS:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    if OLD_ID not in text:
        continue
    path.write_text(text.replace(OLD_ID, NEW_ID), encoding="utf-8")
    changed.append(str(path))

print("Accounting database ID switched in:", ", ".join(changed) if changed else "no files")
