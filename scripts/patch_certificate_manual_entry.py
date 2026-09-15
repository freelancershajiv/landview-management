from pathlib import Path

path = Path('app/admin/certificates/page.tsx')
text = path.read_text()

text = text.replace('import { landViewApi, type FinanceSheetData } from "@/lib/api";\n', '')
text = text.replace('type ProjectCategory = "Running" | "Paused" | "Completed";\n', '')
text = text.replace('type Row = Record<string, any>;\n', '')
text = text.replace('type DriveIndexResponse = { bulk: true; category?: string; projects: Record<string, any> };\n', '')

start = text.find('function pick(row: Row, keys: string[])')
end = text.find('export default function CertificatesPage()')
if start != -1 and end != -1:
    keep = 'function localDate(value?: string) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }\nfunction today() { return localDate(new Date().toISOString()); }\nfunction displayDate(value?: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }\n\n'
    text = text[:start] + keep + text[end:]

text = text.replace('  const [projects, setProjects] = useState<Row[]>([]);\n', '')
text = text.replace('  const [employees, setEmployees] = useState<Row[]>([]);\n', '')
text = text.replace('  const [sourceError, setSourceError] = useState("");\n', '')
text = text.replace('  const [loadingSources, setLoadingSources] = useState(true);\n', '')

old_effect = '''  useEffect(() => {\n    let cancelled = false;\n    void loadRegistry();\n    (async () => {\n      const [file, running, paused, completed, employee] = await Promise.allSettled([\n        landViewApi.getFinanceSheet("File List"),\n        getDriveIndex("Running"),\n        getDriveIndex("Paused"),\n        getDriveIndex("Completed"),\n        landViewApi.getEmployees(),\n      ]);\n      if (cancelled) return;\n      if (employee.status === "fulfilled") setEmployees(employee.value || []);\n      if (file.status === "fulfilled") {\n        const indexes = [running, paused, completed].filter((x): x is PromiseFulfilledResult<DriveIndexResponse> => x.status === "fulfilled").map((x) => x.value);\n        if (indexes.length) setProjects(visibleProjects(file.value, indexes)); else setSourceError("Could not load visible projects.");\n      } else setSourceError("Could not load File List project details.");\n      setLoadingSources(false);\n    })();\n    return () => { cancelled = true; };\n  }, []);\n'''
new_effect = '''  useEffect(() => {\n    void loadRegistry();\n  }, []);\n'''
text = text.replace(old_effect, new_effect)

start = text.find('  function selectProject(id: string) {')
end = text.find('  function editReissue(item: CertificateRecord) {')
if start != -1 and end != -1:
    text = text[:start] + text[end:]

text = text.replace('          {sourceError && type === "project" && <div className="cert-alert">{sourceError}</div>}\n', '')

project_dropdown = '            {type === "project" && <label className="cert-field full"><span>SELECT VISIBLE PROJECT ({projects.length})</span><select value={reference} onChange={(e) => selectProject(e.target.value)} disabled={loadingSources}><option value="">{loadingSources ? "Loading visible projects…" : "Choose project"}</option>{projects.map((row) => <option key={projectId(row)} value={projectId(row)}>{projectLabel(row)}</option>)}</select></label>}\n'
employee_dropdown = '            {type === "employee" && <label className="cert-field full"><span>SELECT EMPLOYEE ({employees.length})</span><select value={reference} onChange={(e) => selectEmployee(e.target.value)} disabled={loadingSources}><option value="">Choose employee</option>{employees.map((row) => <option key={employeeId(row)} value={employeeId(row)}>{employeeId(row)} · {text(pick(row, ["Employee_Name", "Employee Name", "Name"]))}</option>)}</select></label>}\n'
text = text.replace(project_dropdown, '')
text = text.replace(employee_dropdown, '')

text = text.replace('<header className="cert-hero"><small>OFFICIAL DOCUMENTS</small><h1>Certificate center.</h1><p>Issue, reissue, revoke and withdraw QR-verifiable LAND VIEW certificates.</p></header>', '<header className="cert-hero"><small>OFFICIAL DOCUMENTS</small><h1>Certificate center.</h1><p>Issue, reissue, revoke and withdraw QR-verifiable LAND VIEW certificates. Project and employee details are entered manually.</p></header>')

path.write_text(text)
print('Patched certificate center for manual-only project and employee entry.')
# workflow trigger
