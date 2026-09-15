from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch target: {label}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Projects register: make operational status explicit and editable.
# -----------------------------------------------------------------------------
projects_path = Path("app/admin/projects/page.tsx")
projects = projects_path.read_text(encoding="utf-8")

projects = replace_once(
    projects,
    'type ProjectCategory = "Running" | "Paused" | "Completed";',
    'type ProjectCategory = "Running" | "Paused" | "Completed" | "Cancelled";',
    "project category type",
)

projects = replace_once(
    projects,
    '''function normalizeCategory(value: unknown): ProjectCategory {\n  const text = String(value || "").trim().toLowerCase();\n  if (/complete|completed|done|closed|finish/.test(text)) return "Completed";\n  if (/pause|paused|hold|inactive|cancel/.test(text)) return "Paused";\n  return "Running";\n}''',
    '''function normalizeCategory(value: unknown): ProjectCategory {\n  const text = String(value || "").trim().toLowerCase();\n  if (/cancel|cancelled|canceled|abandon/.test(text)) return "Cancelled";\n  if (/complete|completed|done|closed|finish/.test(text)) return "Completed";\n  if (/pause|paused|hold|inactive/.test(text)) return "Paused";\n  return "Running";\n}\nfunction projectStatusLabel(value: unknown) {\n  const status = normalizeCategory(value);\n  if (status === "Running") return "Ongoing";\n  if (status === "Paused") return "On Hold";\n  return status;\n}''',
    "project status normalizer",
)

projects = replace_once(
    projects,
    '  const [savingPublic, setSavingPublic] = useState("");\n  const [savingTask, setSavingTask] = useState("");',
    '  const [savingPublic, setSavingPublic] = useState("");\n  const [savingStatus, setSavingStatus] = useState("");\n  const [savingTask, setSavingTask] = useState("");',
    "project status saving state",
)

projects = replace_once(
    projects,
    '              Status: driveCategory,',
    '              Status: String(current.Status || pick(existingDb, ["Status", "status"], driveCategory) || driveCategory),',
    "existing project drive status priority",
)
projects = replace_once(
    projects,
    '            Status: driveCategory,',
    '            Status: String(pick(existingDb, ["Status", "status"], driveCategory) || driveCategory),',
    "drive-only project status priority",
)

projects = replace_once(
    projects,
    '    Completed: projects.filter((p) => normalizeCategory(p.Status) === "Completed").length,\n  }), [projects]);',
    '    Completed: projects.filter((p) => normalizeCategory(p.Status) === "Completed").length,\n    Cancelled: projects.filter((p) => normalizeCategory(p.Status) === "Cancelled").length,\n  }), [projects]);',
    "project status counts",
)

status_fn = '''\n  async function setProjectStatus(project: ProjectRow, next: ProjectCategory) {\n    const id = normalizeProjectId(project.Project_ID);\n    if (!canManage || !id || savingStatus) return;\n    setSavingStatus(id);\n    setError("");\n    try {\n      try {\n        await landViewApi.updateProject(id, { Status: next });\n      } catch (initialError: any) {\n        if (!/project not found/i.test(String(initialError?.message || initialError))) throw initialError;\n        const seedResponse = await fetch("/api/project-public-visibility", {\n          method: "POST",\n          headers: { "Content-Type": "application/json" },\n          credentials: "same-origin",\n          cache: "no-store",\n          body: JSON.stringify({\n            projectId: id,\n            publicDisplay: truthy(project.Public_Display),\n            project: {\n              Legacy_File_ID: project.Legacy_File_ID || id.replace("LV-", ""),\n              Project_Name: project.Project_Name || "",\n              Client_Name: project.Client_Name || project.Project_Name || "",\n              Phone_Number: project.Phone_Number || "",\n              Project_Type: project.Project_Type || "",\n              Location: project.Location || "",\n              Project_Area: project.Project_Area || "",\n              Number_of_Stories: project.Number_of_Stories || "",\n              Drive_Folder_URL: project.Drive_Folder_URL || "",\n            },\n          }),\n        });\n        const seedJson = await seedResponse.json().catch(() => null);\n        if (!seedResponse.ok || !seedJson?.success) throw new Error(String(seedJson?.error || `Could not register ${id} for status control.`));\n        await landViewApi.updateProject(id, { Status: next });\n      }\n      setProjects((rows) => rows.map((row) => normalizeProjectId(row.Project_ID) === id ? { ...row, Status: next } : row));\n    } catch (e: any) {\n      setError(e?.message || `Could not update ${id} status.`);\n    } finally {\n      setSavingStatus("");\n    }\n  }\n'''
projects = replace_once(
    projects,
    '\n  async function assignService(task: TaskRow, employeeId: string) {',
    status_fn + '\n  async function assignService(task: TaskRow, employeeId: string) {',
    "project status updater",
)

projects = replace_once(
    projects,
    '{(["All","Running","Paused","Completed"] as const).map((item) => <button key={item} type="button" className={`filter-btn ${category===item?"active":""}`} onClick={() => setCategory(item)}>{item} · {counts[item]}</button>)}',
    '{(["All","Running","Paused","Completed","Cancelled"] as const).map((item) => <button key={item} type="button" className={`filter-btn ${category===item?"active":""}`} onClick={() => setCategory(item)}>{item === "All" ? "All" : projectStatusLabel(item)} · {counts[item]}</button>)}',
    "project status filter buttons",
)

projects = replace_once(
    projects,
    '<td><StatusBadge value={normalizeCategory(project.Status)} /></td>',
    '<td>{canManage ? <select aria-label={`Status for ${id}`} value={normalizeCategory(project.Status)} disabled={savingStatus===id} onChange={(e)=>void setProjectStatus(project,e.target.value as ProjectCategory)} style={{height:34,minWidth:112,border:"1px solid rgba(255,255,255,.14)",borderRadius:7,background:"#111b24",color:"#eef2f5",padding:"0 9px",fontSize:11,fontWeight:800}}><option value="Running">Ongoing</option><option value="Paused">On Hold</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select> : <StatusBadge value={projectStatusLabel(project.Status)} />}</td>',
    "inline project status control",
)

projects = replace_once(
    projects,
    'Project register = Auto Invoice populated projects + every LV project folder found under Running, Paused and Completed in Google Drive. Auto Invoice supplies project details when available; Drive-only projects remain fully usable for team assignment and Public Website control.',
    'Project status is controlled here: Ongoing projects are eligible for new bills, while Completed, On Hold and Cancelled projects are hidden from Add Bill. Projects with money due remain eligible for payment regardless of operational status. Drive folders continue to supply project files and details.',
    "project register status note",
)
projects_path.write_text(projects, encoding="utf-8")


# -----------------------------------------------------------------------------
# Project detail: a saved status must take priority over the Drive folder bucket.
# -----------------------------------------------------------------------------
detail_path = Path("app/admin/projects/[projectId]/page.tsx")
detail = detail_path.read_text(encoding="utf-8")
detail = replace_once(
    detail,
    'if(services?.category)p.Status=services.category;',
    'if(services?.category&&!String(p.Status||"").trim())p.Status=services.category;',
    "project detail status priority",
)
detail_path.write_text(detail, encoding="utf-8")


# -----------------------------------------------------------------------------
# Billing: active projects for bills; projects with a positive due for payments.
# -----------------------------------------------------------------------------
billing_path = Path("app/admin/finance/page.tsx")
billing = billing_path.read_text(encoding="utf-8")

billing = replace_once(
    billing,
    '''function paymentIsVisible(record: Record<string, unknown>) {\n  const status = paymentStatus(record);\n  if (["rejected", "declined", "cancelled", "canceled"].includes(status)) return false;\n  return amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])) > 0;\n}\n''',
    '''function paymentIsVisible(record: Record<string, unknown>) {\n  const status = paymentStatus(record);\n  if (["rejected", "declined", "cancelled", "canceled"].includes(status)) return false;\n  return amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])) > 0;\n}\nfunction normalizeProjectId(value: unknown) {\n  const raw = String(value || "").trim().toUpperCase();\n  const digits = raw.replace(/\\D/g, "");\n  return digits ? `LV-${Number(digits)}` : raw;\n}\nfunction operationalStatus(value: unknown) {\n  const text = normalizeStatus(value);\n  if (/cancel|abandon/.test(text)) return "cancelled";\n  if (/complete|done|closed|finish/.test(text)) return "completed";\n  if (/pause|hold|inactive/.test(text)) return "paused";\n  return "running";\n}\nfunction categoryMatches(value: unknown, category: BillCategory) {\n  const text = normalizeStatus(value);\n  if (category === "Engineering Bill") return text.includes("engineering") || text.includes("design");\n  if (category === "Supervision Bill") return text.includes("supervision");\n  return text.includes("other");\n}\n''',
    "billing status helpers",
)

billing = replace_once(
    billing,
    '  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);\n  const [billingBook, setBillingBook] = useState<BillingBookData | null>(null);',
    '  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);\n  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);\n  const [billingBook, setBillingBook] = useState<BillingBookData | null>(null);',
    "billing projects state",
)

billing = replace_once(
    billing,
    '''    Promise.allSettled([currentRequest, summaryRequest, landViewApi.getPayments(), landViewApi.getBillingBook()]).then((results) => {\n      if (request.current !== id) return;\n      const [current, summary, paymentResult, bookResult] = results;''',
    '''    Promise.allSettled([currentRequest, summaryRequest, landViewApi.getPayments(), landViewApi.getProjects(), landViewApi.getBillingBook()]).then((results) => {\n      if (request.current !== id) return;\n      const [current, summary, paymentResult, projectResult, bookResult] = results;''',
    "billing data requests",
)

billing = replace_once(
    billing,
    '      setPayments(paymentResult.status === "fulfilled" ? paymentResult.value : []);\n      setBillingBook(bookResult.status === "fulfilled" ? bookResult.value : null);',
    '      setPayments(paymentResult.status === "fulfilled" ? paymentResult.value : []);\n      setProjects(projectResult.status === "fulfilled" ? projectResult.value : []);\n      setBillingBook(bookResult.status === "fulfilled" ? bookResult.value : null);',
    "billing project result",
)

billing = replace_once(
    billing,
    '  const projectOptions = useMemo(() => (summaryData?.rows || []).map((row) => ({ id: String(row[0] || "").trim(), client: String(row[1] || "").trim(), row })).filter((item) => item.id), [summaryData]);',
    '''  const projectStatusMap = useMemo(() => {\n    const map = new Map<string, string>();\n    projects.forEach((project) => {\n      const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));\n      if (id) map.set(id, operationalStatus(field(project, ["Status", "Project_Status", "Project Status"])));\n    });\n    return map;\n  }, [projects]);\n  const projectOptions = useMemo(() => (summaryData?.rows || []).map((row) => {\n    const id = String(row[0] || "").trim();\n    return { id, client: String(row[1] || "").trim(), row, status: projectStatusMap.get(normalizeProjectId(id)) || "running" };\n  }).filter((item) => item.id), [summaryData, projectStatusMap]);''',
    "billing project options with status",
)

billing = replace_once(
    billing,
    '  const newAppBills = billingBook?.totals?.billed || 0;\n',
    '''  const newAppBills = billingBook?.totals?.billed || 0;\n  const activeProjectOptions = projectOptions.filter((item) => item.status === "running");\n  const appCategoryDue = (projectId: string, category: BillCategory) => {\n    const bookProject = billingBook?.projects?.find((item) => normalizeProjectId(item.projectId) === normalizeProjectId(projectId));\n    if (!bookProject) return 0;\n    const match = Object.entries(bookProject.categories || {}).find(([key]) => categoryMatches(key, category));\n    return match ? amount(match[1]?.due) : 0;\n  };\n  const categoryDueForProject = (item: { id: string; row: string[][][number] }, category: BillCategory) => {\n    const legacy = category === "Engineering Bill" ? amount(item.row[6]) : category === "Supervision Bill" ? amount(item.row[10]) : amount(item.row[14]);\n    return legacy + appCategoryDue(item.id, category);\n  };\n  const dueProjectOptions = projectOptions.map((item) => ({\n    ...item,\n    totalDue: BILL_CATEGORIES.reduce((sum, category) => sum + Math.max(0, categoryDueForProject(item, category)), 0),\n  })).filter((item) => item.totalDue > 0.009);\n''',
    "billing eligibility collections",
)

billing = replace_once(
    billing,
    '  const selectedPaymentProject = projectOptions.find((item) => item.id === paymentForm.projectId);\n  const selectedDue = selectedPaymentProject ? (paymentForm.category === "Engineering Bill" ? amount(selectedPaymentProject.row[6]) : paymentForm.category === "Supervision Bill" ? amount(selectedPaymentProject.row[10]) : amount(selectedPaymentProject.row[14])) : 0;',
    '  const selectedPaymentProject = dueProjectOptions.find((item) => item.id === paymentForm.projectId);\n  const selectedDue = selectedPaymentProject ? Math.max(0, categoryDueForProject(selectedPaymentProject, paymentForm.category)) : 0;',
    "selected due project",
)

billing = replace_once(
    billing,
    '    if (!paymentForm.projectId) return setPaymentMessage("Choose a project first.");\n    if (received <= 0) return setPaymentMessage("Enter a valid payment amount.");',
    '    if (!paymentForm.projectId) return setPaymentMessage("Choose a project first.");\n    if (selectedDue <= 0) return setPaymentMessage("The selected billing category has no outstanding amount.");\n    if (received <= 0) return setPaymentMessage("Enter a valid payment amount.");\n    if (received > selectedDue + 0.01) return setPaymentMessage(`Payment cannot exceed the current due of ${money(selectedDue)}.`);',
    "payment due validation",
)

billing = replace_once(
    billing,
    'Engineering, supervision or other services.</span></button>',
    'Only ongoing projects are available for new bills.</span></button>',
    "add bill action copy",
)
billing = replace_once(
    billing,
    'Automatically posts received money to Accounts income.</span></button>',
    'Only projects with an outstanding balance are shown.</span></button>',
    "add payment action copy",
)

old_project_options = '{projectOptions.map((item)=><option key={item.id} value={item.id}>{item.id}{item.client?` — ${item.client}`:""}</option>)}'
billing = replace_once(
    billing,
    old_project_options,
    '{activeProjectOptions.map((item)=><option key={item.id} value={item.id}>{item.id}{item.client?` — ${item.client}`:""}</option>)}',
    "add bill active projects",
)
billing = replace_once(
    billing,
    old_project_options,
    '{dueProjectOptions.map((item)=><option key={item.id} value={item.id}>{item.id}{item.client?` — ${item.client}`:""} — Due ${money(item.totalDue)}</option>)}',
    "add payment due projects",
)

billing = replace_once(
    billing,
    '<option value="">Choose project…</option>{activeProjectOptions.map',
    '<option value="">Choose ongoing project…</option>{activeProjectOptions.map',
    "bill project placeholder",
)
billing = replace_once(
    billing,
    '<option value="">Choose project…</option>{dueProjectOptions.map',
    '<option value="">Choose project with due…</option>{dueProjectOptions.map',
    "payment project placeholder",
)

billing = replace_once(
    billing,
    'onChange={(e)=>setPaymentForm((current)=>({...current,projectId:e.target.value}))} style={inputStyle}',
    'onChange={(e)=>{const project=dueProjectOptions.find((item)=>item.id===e.target.value);const firstDue=project?BILL_CATEGORIES.find((category)=>categoryDueForProject(project,category)>0):undefined;setPaymentForm((current)=>({...current,projectId:e.target.value,category:firstDue||current.category,amount:""}))}} style={inputStyle}',
    "payment project category selection",
)

billing = replace_once(
    billing,
    '{BILL_CATEGORIES.map((category)=><option key={category}>{category}</option>)}</select></label><label style={{fontSize:10,color:"#98a3ab"}}>Amount Received',
    '{BILL_CATEGORIES.map((category)=><option key={category} disabled={selectedPaymentProject ? categoryDueForProject(selectedPaymentProject,category)<=0 : false}>{category}{selectedPaymentProject?` — Due ${money(Math.max(0,categoryDueForProject(selectedPaymentProject,category)))}`:""}</option>)}</select></label><label style={{fontSize:10,color:"#98a3ab"}}>Amount Received',
    "payment category due labels",
)

billing = replace_once(
    billing,
    'Existing invoice due: {money(selectedDue)}',
    'Current category due: {money(selectedDue)}',
    "payment due helper text",
)

billing_path.write_text(billing, encoding="utf-8")

print("Applied project operational status and billing eligibility filters.")
