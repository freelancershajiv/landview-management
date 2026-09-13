from pathlib import Path

path = Path("lib/api.ts")
text = path.read_text(encoding="utf-8")

old = '''  getErpRecords: async (module: ErpModule) => {\n    if (module === "tasks") return getBillingDrivenWorkflowTasks();\n    return get<Record<string, unknown>[]>("getErpRecords", { module });\n  },'''

new = '''  getErpRecords: async (module: ErpModule) => {\n    if (module === "tasks") {\n      const session = readSessionCache();\n      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();\n      if (role === "employee" || role === "client") {\n        return get<Record<string, unknown>[]>("getErpRecords", { module });\n      }\n      try {\n        return await getBillingDrivenWorkflowTasks();\n      } catch (error) {\n        const message = error instanceof Error ? error.message : String(error || "");\n        if (/access denied|permission/i.test(message)) {\n          return get<Record<string, unknown>[]>("getErpRecords", { module });\n        }\n        throw error;\n      }\n    }\n    return get<Record<string, unknown>[]>("getErpRecords", { module });\n  },'''

if old not in text:
    if new in text:
        print("Employee task access patch already applied")
    else:
        raise SystemExit("Target getErpRecords block not found")
else:
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("Patched employee task reads to avoid Finance Sheet role denial")
