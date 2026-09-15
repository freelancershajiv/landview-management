"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type LedgerType = "Income" | "Expense";
type ViewMode = "dashboard" | "income" | "expenses" | "employees" | "reports";

type LedgerRow = {
  id: string;
  type: LedgerType;
  date: string;
  fileId: string;
  projectName: string;
  clientName: string;
  category: string;
  rawCategory: string;
  description: string;
  amount: number;
  status: string;
  requestedBy: string;
  approvedBy: string;
  paidTo: string;
  paymentMethod: string;
  reference: string;
  receivedFrom: string;
  receivedBy: string;
  source: string;
  allocationNote: string;
  search: string;
};

type Filters = {
  query: string;
  year: string;
  fileId: string;
  category: string;
  status: string;
  person: string;
  from: string;
  to: string;
};

type MoneySummary = { income: number; expense: number; pending: number; net: number };

type EmployeePayout = {
  person: string;
  salary: number;
  bonus: number;
  total: number;
  records: number;
};

const LEDGER_URL = "https://docs.google.com/spreadsheets/d/11NY1kI7Ewr0FsMRI3jN4zcVY2XxbGVc2fWPM6UpByCs/edit";
const EMPTY_FILTERS: Filters = {
  query: "",
  year: "",
  fileId: "",
  category: "",
  status: "",
  person: "",
  from: "",
  to: "",
};

const t = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value);

function records(data: FinanceSheetData | null) {
  if (!data) return [] as Record<string, string>[];
  return (data.rows || []).map((row) => {
    const result: Record<string, string> = {};
    (data.headers || []).forEach((header, index) => {
      const key = t(header);
      if (key) result[key] = t(row[index]);
    });
    return result;
  });
}

function parseDate(value: unknown) {
  const raw = t(value);
  if (!raw) return null;

  // Old imported Sheets rows sometimes expose a Google/Excel serial date as display text.
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const wholeDays = Math.floor(serial);
      return new Date(1899, 11, 30 + wholeDays);
    }
  }

  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct);

  const match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/);
  if (!match) return null;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) - 1 : months[match[2].toLowerCase()];
  if (month === undefined || month < 0 || month > 11) return null;
  return new Date(Number(match[3]), month, Number(match[1]));
}

function dateKey(value: unknown) {
  const d = parseDate(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yearKey(value: unknown) {
  const key = dateKey(value);
  return key ? key.slice(0, 4) : "";
}

function displayDate(value: unknown) {
  const d = parseDate(value);
  return d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : t(value) || "—";
}

function toIncomeRows(data: FinanceSheetData | null): LedgerRow[] {
  return records(data)
    .map((record) => {
      const category = t(record.Income_Category) || "Other Income";
      const row: LedgerRow = {
        id: t(record.Income_ID),
        type: "Income",
        date: t(record.Payment_Date),
        fileId: t(record.File_ID),
        projectName: t(record.Project_Name),
        clientName: t(record.Client_Name),
        category,
        rawCategory: category,
        description: t(record.Payment_For) || "Income received",
        amount: amount(record.Amount),
        status: "Received",
        requestedBy: "",
        approvedBy: "",
        paidTo: "",
        paymentMethod: t(record.Payment_Method),
        reference: t(record.Reference_No),
        receivedFrom: t(record.Received_From),
        receivedBy: t(record.Received_By),
        source: t(record.Created_By),
        allocationNote: "",
        search: "",
      };
      row.search = Object.values(row).join(" ").toLowerCase();
      return row;
    })
    .filter((row) => row.id);
}

function toExpenseRows(data: FinanceSheetData | null): LedgerRow[] {
  return records(data)
    .map((record) => {
      const rawCategory = t(record.Category) || "Miscellaneous";
      const description = t(record.Description) || "Office expense";
      const historical = /^HIST-/i.test(t(record.Expense_ID)) || /^historical import$/i.test(t(record.Created_By));
      const ronyPersonal =
        historical &&
        rawCategory === "Owner / Personal Draw" &&
        /(eng(?:ineer)?\s+rony|jamal\s+rony|nisha\s+apu)/i.test(description);
      const ronyPrivateCar = historical && rawCategory === "Vehicle / Car Expense";
      const allocateToRonySalary = ronyPersonal || ronyPrivateCar;

      const row: LedgerRow = {
        id: t(record.Expense_ID),
        type: "Expense",
        date: t(record.Expense_Date),
        fileId: t(record.File_ID),
        projectName: t(record.Project_Name),
        clientName: "",
        category: allocateToRonySalary ? "Salary / Wages" : rawCategory,
        rawCategory,
        description,
        amount: amount(record.Amount),
        status: t(record.Approval_Status) || "Pending",
        requestedBy: t(record.Requested_By),
        approvedBy: t(record.Approved_By),
        paidTo: allocateToRonySalary ? "Eng Rony" : t(record.Paid_To),
        paymentMethod: t(record.Payment_Method),
        reference: t(record.Reference_No),
        receivedFrom: "",
        receivedBy: "",
        source: t(record.Created_By),
        allocationNote: allocateToRonySalary
          ? `Management allocation from ${rawCategory} to Eng Rony salary`
          : "",
        search: "",
      };
      row.search = Object.values(row).join(" ").toLowerCase();
      return row;
    })
    .filter((row) => row.id);
}

function summarize(rows: LedgerRow[]): MoneySummary {
  const income = rows
    .filter((row) => row.type === "Income")
    .reduce((sum, row) => sum + row.amount, 0);
  const expense = rows
    .filter((row) => row.type === "Expense" && row.status.toLowerCase() === "approved")
    .reduce((sum, row) => sum + row.amount, 0);
  const pending = rows
    .filter((row) => row.type === "Expense" && row.status.toLowerCase() === "pending")
    .reduce((sum, row) => sum + row.amount, 0);
  return { income, expense, pending, net: income - expense };
}

function employeePayouts(rows: LedgerRow[]): EmployeePayout[] {
  const map = new Map<string, EmployeePayout>();
  rows.forEach((row) => {
    if (row.type !== "Expense" || row.status.toLowerCase() !== "approved") return;
    if (row.category !== "Salary / Wages" && row.category !== "Staff Commission / Bonus") return;
    const person = t(row.paidTo || row.requestedBy);
    if (!person || /^not recorded$/i.test(person)) return;
    const current = map.get(person) || { person, salary: 0, bonus: 0, total: 0, records: 0 };
    if (row.category === "Staff Commission / Bonus") current.bonus += row.amount;
    else current.salary += row.amount;
    current.total += row.amount;
    current.records += 1;
    map.set(person, current);
  });
  return [...map.values()].sort((a, b) => b.total - a.total || a.person.localeCompare(b.person));
}

function ascii(value: unknown) {
  return t(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function clip(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, Math.max(0, max - 3)) + "...";
}

function buildPdf(title: string, rows: LedgerRow[], summary: MoneySummary, filterText: string) {
  const RED = "0.882 0.169 0.192";
  const RED_DARK = "0.710 0.090 0.122";
  const BLACK = "0.090 0.098 0.106";
  const DARK = "0.145 0.157 0.169";
  const MID = "0.360 0.390 0.410";
  const LIGHT = "0.965 0.968 0.970";
  const BORDER = "0.820 0.830 0.840";
  const WHITE = "1 1 1";

  const pdfText = (value: unknown, max = 120) => pdfEscape(clip(ascii(value), max));
  const textCmd = (x: number, y: number, font: "F1" | "F2", size: number, color: string, value: unknown, max = 120) =>
    `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value, max)}) Tj ET
`;
  const fillRect = (x: number, y: number, w: number, h: number, color: string) => `${color} rg ${x} ${y} ${w} ${h} re f
`;
  const strokeRect = (x: number, y: number, w: number, h: number, color: string, width = 0.6) => `${color} RG ${width} w ${x} ${y} ${w} ${h} re S
`;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, width = 0.8) => `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S
`;
  const moneyText = (value: number) => `BDT ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const firstPageCount = 17;
  const laterPageCount = 21;
  const pages: LedgerRow[][] = [];
  pages.push(rows.slice(0, firstPageCount));
  for (let i = firstPageCount; i < rows.length; i += laterPageCount) pages.push(rows.slice(i, i + laterPageCount));
  if (!rows.length) pages[0] = [];

  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const pageIds: number[] = [];

  pages.forEach((pageRows, pageIndex) => {
    const pageId = 5 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    let stream = "";

    // Header / brand
    stream += textCmd(42, 804, "F2", 19, BLACK, "LAND", 20);
    stream += textCmd(101, 804, "F2", 19, RED, "VIEW", 20);
    stream += textCmd(42, 788, "F2", 7.5, DARK, "ENGINEERS & ARCHITECTS", 40);
    stream += textCmd(553, 806, "F1", 7, MID, `Page ${pageIndex + 1} of ${pages.length}`, 30);
    stream += line(42, 777, 553, 777, RED, 2.2);
    stream += textCmd(42, 754, "F2", 14, BLACK, title, 78);
    if (pageIndex === 0) {
      stream += textCmd(42, 738, "F1", 7.3, MID, `Generated: ${new Date().toLocaleString("en-GB")}`, 70);
      if (filterText) stream += textCmd(300, 738, "F1", 7.3, MID, `Filters: ${filterText}`, 68);

      const cards = [
        ["INCOME", moneyText(summary.income)],
        ["APPROVED EXPENSE", moneyText(summary.expense)],
        ["PENDING", moneyText(summary.pending)],
        ["NET", moneyText(summary.net)],
      ];
      cards.forEach(([label, value], index) => {
        const x = 42 + index * 128;
        const bg = index === 3 ? RED : LIGHT;
        const labelColor = index === 3 ? WHITE : MID;
        const valueColor = index === 3 ? WHITE : BLACK;
        stream += fillRect(x, 684, 119, 43, bg);
        stream += strokeRect(x, 684, 119, 43, index === 3 ? RED_DARK : BORDER, 0.7);
        stream += textCmd(x + 8, 712, "F2", 6.3, labelColor, label, 24);
        stream += textCmd(x + 8, 694, "F2", 9.2, valueColor, value, 24);
      });
      stream += textCmd(42, 671, "F1", 7.2, MID, `Transactions: ${rows.length}`, 35);
    }

    const headerY = pageIndex === 0 ? 644 : 724;
    stream += fillRect(42, headerY, 511, 22, DARK);
    stream += line(42, headerY, 553, headerY, RED, 1.4);
    const cols = [
      [48, "DATE"], [120, "TYPE"], [172, "FILE"], [223, "CATEGORY"], [420, "AMOUNT"], [505, "STATUS"],
    ] as const;
    cols.forEach(([x, label]) => { stream += textCmd(x, headerY + 8, "F2", 6.5, WHITE, label, 28); });

    let y = headerY - 23;
    if (!pageRows.length) {
      stream += textCmd(48, y, "F1", 9, MID, "No matching transactions.", 80);
    }

    pageRows.forEach((row, index) => {
      if (index % 2 === 1) stream += fillRect(42, y - 12, 511, 27, LIGHT);
      stream += line(42, y - 13, 553, y - 13, BORDER, 0.35);
      const typeColor = row.type === "Income" ? "0.125 0.435 0.250" : RED_DARK;
      stream += textCmd(48, y, "F1", 7.1, BLACK, displayDate(row.date), 15);
      stream += textCmd(120, y, "F2", 6.8, typeColor, row.type.toUpperCase(), 10);
      stream += textCmd(172, y, "F1", 7.0, BLACK, row.fileId || "-", 12);
      stream += textCmd(223, y, "F1", 7.0, BLACK, row.category, 31);
      stream += textCmd(420, y, "F2", 7.0, BLACK, moneyText(row.amount), 18);
      stream += textCmd(505, y, "F1", 6.7, BLACK, row.status, 12);
      const detail = `${row.description}${row.type === "Expense" && row.paidTo ? ` | Paid to: ${row.paidTo}` : ""}${row.type === "Income" && row.receivedFrom ? ` | From: ${row.receivedFrom}` : ""}`;
      stream += textCmd(48, y - 11, "F1", 6.5, MID, detail, 104);
      y -= 28;
    });

    stream += line(42, 34, 553, 34, RED, 1.1);
    stream += textCmd(42, 20, "F2", 6.8, BLACK, "LAND VIEW", 25);
    stream += textCmd(101, 20, "F1", 6.5, MID, "Building a safer tomorrow", 45);
    stream += textCmd(475, 20, "F1", 6.5, MID, `Page ${pageIndex + 1} / ${pages.length}`, 25);

    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>
stream
${stream}
endstream`;
  });

  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = new TextEncoder().encode(pdf).length;
    pdf += `${i} 0 obj
${objects[i]}
endobj
`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref
0 ${objects.length}
0000000000 65535 f 
`;
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n 
`;
  pdf += `trailer
<< /Size ${objects.length} /Root 1 0 R >>
startxref
${xref}
%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export default function AccountsLedgerPage() {
  const [incomeData, setIncomeData] = useState<FinanceSheetData | null>(null);
  const [expenseData, setExpenseData] = useState<FinanceSheetData | null>(null);
  const [mode, setMode] = useState<ViewMode>("dashboard");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      landViewApi.getFinanceSheet("Accounting Income"),
      landViewApi.getFinanceSheet("Accounting Expenses"),
    ])
      .then(([income, expenses]) => {
        if (cancelled) return;
        setIncomeData(income);
        setExpenseData(expenses);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the accounting ledger.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const allRows = useMemo(() => {
    const combined = [...toIncomeRows(incomeData), ...toExpenseRows(expenseData)];
    return combined.sort(
      (a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0),
    );
  }, [incomeData, expenseData]);

  const years = useMemo(
    () => [...new Set(allRows.map((row) => yearKey(row.date)).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [allRows],
  );
  const categories = useMemo(
    () => [...new Set(allRows.map((row) => row.category).filter(Boolean))].sort(),
    [allRows],
  );
  const statuses = useMemo(
    () => [...new Set(allRows.map((row) => row.status).filter(Boolean))].sort(),
    [allRows],
  );
  const fileIds = useMemo(
    () =>
      [...new Set(allRows.map((row) => row.fileId).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [allRows],
  );

  const filteredRows = useMemo(
    () =>
      allRows.filter((row) => {
        if (mode === "income" && row.type !== "Income") return false;
        if (mode === "expenses" && row.type !== "Expense") return false;
        if (
          mode === "employees" &&
          (row.type !== "Expense" ||
            !["Salary / Wages", "Staff Commission / Bonus"].includes(row.category) ||
            row.status.toLowerCase() !== "approved")
        )
          return false;

        const query = filters.query.trim().toLowerCase();
        if (query && !row.search.includes(query)) return false;
        if (filters.year && yearKey(row.date) !== filters.year) return false;
        if (filters.fileId && row.fileId !== filters.fileId) return false;
        if (filters.category && row.category !== filters.category) return false;
        if (filters.status && row.status !== filters.status) return false;

        const person = filters.person.trim().toLowerCase();
        if (
          person &&
          ![row.requestedBy, row.approvedBy, row.paidTo, row.receivedFrom, row.receivedBy]
            .join(" ")
            .toLowerCase()
            .includes(person)
        )
          return false;

        const key = dateKey(row.date);
        if (filters.from && (!key || key < filters.from)) return false;
        if (filters.to && (!key || key > filters.to)) return false;
        return true;
      }),
    [allRows, filters, mode],
  );

  const summary = useMemo(() => summarize(filteredRows), [filteredRows]);

  const yearBreakdown = useMemo(
    () =>
      years.map((year) => {
        const rows = allRows.filter((row) => yearKey(row.date) === year);
        return { year, rows: rows.length, ...summarize(rows) };
      }),
    [allRows, years],
  );

  const currentMonth = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return summarize(allRows.filter((row) => dateKey(row.date).startsWith(prefix)));
  }, [allRows]);

  const allPayoutsForSelectedYear = useMemo(() => {
    const rows = filters.year ? allRows.filter((row) => yearKey(row.date) === filters.year) : allRows;
    return employeePayouts(rows);
  }, [allRows, filters.year]);

  const ronyAllocated = useMemo(
    () =>
      allRows
        .filter((row) => row.type === "Expense" && row.allocationNote && (!filters.year || yearKey(row.date) === filters.year))
        .reduce((sum, row) => sum + row.amount, 0),
    [allRows, filters.year],
  );

  const pages = Math.max(1, Math.ceil(filteredRows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const shown = filteredRows.slice(currentPage * 50, (currentPage + 1) * 50);

  function patchFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  }
  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }
  function selectMode(next: ViewMode) {
    setMode(next);
    setPage(0);
  }
  function selectYear(year: string) {
    patchFilter("year", year);
  }
  function recallFile(fileId: string) {
    setMode("reports");
    setFilters((current) => ({ ...EMPTY_FILTERS, year: current.year, fileId }));
    setPage(0);
  }
  function recallEmployee(person: string) {
    setMode("employees");
    setFilters((current) => ({ ...EMPTY_FILTERS, year: current.year, status: "Approved", person }));
    setPage(0);
  }

  function reportTitle() {
    const yearLabel = filters.year ? ` - ${filters.year}` : "";
    if (filters.fileId) return `Project Accounts Statement - ${filters.fileId}${yearLabel}`;
    if (mode === "employees") return `Employee Compensation Statement${yearLabel}`;
    if (mode === "income") return `Income Statement${yearLabel}`;
    if (mode === "expenses") return `Expense Statement${yearLabel}`;
    if (filters.person) return `${filters.person} Account Statement${yearLabel}`;
    if (filters.category) return `${filters.category} Statement${yearLabel}`;
    return `Income & Expense Statement${yearLabel}`;
  }

  function downloadPdf() {
    const parts = [
      filters.year && `year ${filters.year}`,
      filters.fileId,
      filters.category,
      filters.status,
      filters.person,
      filters.from && `from ${filters.from}`,
      filters.to && `to ${filters.to}`,
      filters.query && `search: ${filters.query}`,
    ].filter(Boolean);
    const blob = buildPdf(reportTitle(), filteredRows, summary, parts.join("; "));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `LAND-VIEW-${reportTitle().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const panelTitle =
    mode === "income"
      ? "Income register"
      : mode === "expenses"
        ? "Expense register"
        : mode === "employees"
          ? "Employee compensation register"
          : mode === "reports"
            ? reportTitle()
            : "Recent ledger activity";

  return (
    <main className="ledger-page">
      <style>{`
        .ledger-page{color:#eef2f5;max-width:1500px;margin:0 auto}.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:.18em;color:#ef6c66;font-weight:900}.hero h1{font-size:38px;line-height:1;margin:7px 0 8px}.hero p{margin:0;color:#8997a2;max-width:820px;font-size:12px;line-height:1.65}.hero-actions{display:flex;gap:8px;flex-wrap:wrap}.btn,.hero-actions a{border:1px solid #3a4853;background:#151f27;color:#eef2f5;border-radius:8px;padding:10px 13px;font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}.btn.primary{background:#d61f26;border-color:#d61f26}.btn:disabled{opacity:.45;cursor:not-allowed}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.metric{background:#101820;border:1px solid #2d3943;border-radius:12px;padding:15px}.metric span{display:block;color:#7e8b95;font-size:9px;font-weight:800;letter-spacing:.08em}.metric strong{display:block;margin-top:7px;font-size:22px}.metric small{display:block;color:#687681;margin-top:4px;font-size:9px;line-height:1.5}.year-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin:0 0 14px}.year-card{appearance:none;text-align:left;background:#0e171e;border:1px solid #2b3740;border-radius:10px;padding:12px;color:#e9eef1;cursor:pointer}.year-card.active{border-color:#d61f26;box-shadow:inset 0 0 0 1px #d61f26}.year-card span{font-size:10px;color:#ef7a72;font-weight:900}.year-card b{display:block;font-size:17px;margin:5px 0}.year-card small{color:#75838d;font-size:9px}.tabs{display:flex;gap:4px;border-bottom:1px solid #29343d;margin:8px 0 14px;overflow:auto}.tabs button{white-space:nowrap;border:0;background:transparent;color:#7e8b95;padding:11px 15px;font-size:11px;font-weight:900;cursor:pointer;border-bottom:2px solid transparent}.tabs button.active{color:#fff;border-bottom-color:#d61f26}.filters{display:grid;grid-template-columns:minmax(210px,2fr) 110px repeat(3,minmax(125px,1fr)) minmax(130px,1fr) repeat(2,135px) auto;gap:8px;padding:12px;background:#101820;border:1px solid #29343d;border-radius:11px;margin-bottom:14px}.filters input,.filters select{min-width:0;background:#0b1117;border:1px solid #34414b;color:#eef2f5;border-radius:7px;padding:9px 10px;font-size:10px}.filters input::placeholder{color:#65737e}.panel{background:#101820;border:1px solid #2d3943;border-radius:12px;overflow:hidden}.panel-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 15px;border-bottom:1px solid #29343d}.panel-head h2{margin:0;font-size:16px}.panel-head span{color:#71808b;font-size:10px}.table-wrap{overflow:auto}.ledger-table{width:100%;border-collapse:collapse;min-width:1120px}.ledger-table th{position:sticky;top:0;background:#17222b;color:#81909a;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px;border-bottom:1px solid #34404a}.ledger-table td{padding:11px 12px;border-bottom:1px solid #253039;font-size:10px;vertical-align:top}.ledger-table tr:hover td{background:#131d25}.desc{font-weight:800;max-width:390px}.sub{display:block;color:#71808b;font-size:9px;margin-top:4px}.allocation{display:block;color:#e6b56b;font-size:8px;margin-top:4px}.type{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:900}.type.income{background:#163c2a;color:#8ce3ad}.type.expense{background:#3e2022;color:#ffaaa7}.status{display:inline-flex;padding:4px 7px;border-radius:999px;background:#27343d;color:#b8c2c9;font-size:8px}.file-button,.person-button{border:0;background:transparent;color:#ef7a72;padding:0;font-size:10px;font-weight:900;cursor:pointer;text-align:left}.person-button{color:#9cc7ff}.amount.income{color:#8ce3ad}.amount.expense{color:#ff9e98}.footer{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;color:#71808b;font-size:9px}.footer div{display:flex;gap:6px}.footer button{background:#17222b;border:1px solid #34414b;color:#dce2e6;border-radius:6px;padding:6px 9px;font-size:9px}.footer button:disabled{opacity:.35}.error{margin-bottom:12px;padding:11px 13px;border:1px solid #74373b;border-radius:8px;background:#351c1e;color:#ffb1ad;font-size:11px}.loading{padding:28px;color:#84919b}.report-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:12px;margin-bottom:14px}.report-box{border:1px solid #2d3943;background:#101820;border-radius:12px;padding:16px}.report-box h3{margin:0 0 6px}.report-box p{margin:0 0 12px;color:#7e8b95;font-size:10px;line-height:1.55}.report-presets{display:flex;gap:7px;flex-wrap:wrap}.report-presets button{background:#17222b;border:1px solid #34414b;color:#e8edf0;border-radius:7px;padding:8px 9px;font-size:9px;cursor:pointer}.month-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.month-stats div{padding:10px;background:#0c1319;border-radius:8px}.month-stats span{display:block;color:#70808b;font-size:8px}.month-stats b{display:block;margin-top:5px;font-size:12px}.employee-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.employee-card{background:#0c1319;border:1px solid #26323b;border-radius:9px;padding:11px}.employee-card button{border:0;background:transparent;color:#dfe8ee;font-weight:900;padding:0;cursor:pointer}.employee-card strong{display:block;font-size:16px;margin:6px 0}.employee-card small{color:#788792;font-size:8px;line-height:1.5}.policy-note{margin-top:10px;padding:10px 11px;border-left:2px solid #d61f26;background:#131b22;color:#9aa7b0;font-size:9px;line-height:1.55}@media(max-width:1180px){.metrics{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:repeat(3,minmax(0,1fr))}.report-grid{grid-template-columns:1fr}}@media(max-width:760px){.hero{align-items:flex-start;flex-direction:column}.hero h1{font-size:31px}.metrics{grid-template-columns:1fr}.filters{grid-template-columns:1fr}.report-grid{grid-template-columns:1fr}}
      `}</style>

      <header className="hero">
        <div>
          <span className="eyebrow">LAND VIEW / ACCOUNTS LEDGER</span>
          <h1>Income, expenses & employee payouts.</h1>
          <p>
            Recall the 2024–2026 accounting history by year, file, category or person, compare employee compensation,
            and export the active view as a PDF statement. Historical descriptions remain visible even when a
            management allocation is applied.
          </p>
        </div>
        <div className="hero-actions">
          <a href={LEDGER_URL} target="_blank" rel="noopener noreferrer">
            Open database ↗
          </a>
          <button className="btn" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
            ↻ Refresh
          </button>
          <button className="btn primary" disabled={loading || !filteredRows.length} onClick={downloadPdf}>
            Generate PDF
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="metrics">
        <article className="metric">
          <span>FILTERED INCOME</span>
          <strong>{money(summary.income)}</strong>
          <small>{filteredRows.filter((row) => row.type === "Income").length.toLocaleString("en-BD")} receipts</small>
        </article>
        <article className="metric">
          <span>APPROVED EXPENSES</span>
          <strong>{money(summary.expense)}</strong>
          <small>
            {filteredRows
              .filter((row) => row.type === "Expense" && row.status.toLowerCase() === "approved")
              .length.toLocaleString("en-BD")} records
          </small>
        </article>
        <article className="metric">
          <span>NET POSITION</span>
          <strong>{money(summary.net)}</strong>
          <small>Income minus approved expenses</small>
        </article>
        <article className="metric">
          <span>RONY SALARY ALLOCATION</span>
          <strong>{money(ronyAllocated)}</strong>
          <small>{filters.year ? `${filters.year} management allocation` : "All-year personal + private-car allocation"}</small>
        </article>
      </section>

      <section className="year-strip" aria-label="Yearly accounting summary">
        <button className={`year-card ${filters.year === "" ? "active" : ""}`} onClick={() => selectYear("")}>
          <span>ALL YEARS</span>
          <b>{allRows.length.toLocaleString("en-BD")} records</b>
          <small>Income {money(summarize(allRows).income)} · Net {money(summarize(allRows).net)}</small>
        </button>
        {yearBreakdown.map((item) => (
          <button
            key={item.year}
            className={`year-card ${filters.year === item.year ? "active" : ""}`}
            onClick={() => selectYear(item.year)}
          >
            <span>{item.year}</span>
            <b>{money(item.net)}</b>
            <small>Income {money(item.income)} · Expense {money(item.expense)} · {item.rows.toLocaleString("en-BD")} records</small>
          </button>
        ))}
      </section>

      <nav className="tabs" aria-label="Accounts ledger sections">
        {(["dashboard", "income", "expenses", "employees", "reports"] as ViewMode[]).map((item) => (
          <button key={item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}>
            {item === "dashboard"
              ? "Dashboard"
              : item === "income"
                ? "Income"
                : item === "expenses"
                  ? "Expenses"
                  : item === "employees"
                    ? "Employee payouts"
                    : "Reports & PDF"}
          </button>
        ))}
      </nav>

      <section className="filters" aria-label="Recall and filter transactions">
        <input
          type="search"
          value={filters.query}
          placeholder="Recall transaction, ID, description…"
          onChange={(event) => patchFilter("query", event.target.value)}
        />
        <select value={filters.year} onChange={(event) => patchFilter("year", event.target.value)}>
          <option value="">All years</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select value={filters.fileId} onChange={(event) => patchFilter("fileId", event.target.value)}>
          <option value="">All file IDs</option>
          {fileIds.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        <select value={filters.category} onChange={(event) => patchFilter("category", event.target.value)}>
          <option value="">All categories</option>
          {categories.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => patchFilter("status", event.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <input
          value={filters.person}
          placeholder="Person / employee…"
          onChange={(event) => patchFilter("person", event.target.value)}
        />
        <input
          type="date"
          value={filters.from}
          aria-label="From date"
          onChange={(event) => patchFilter("from", event.target.value)}
        />
        <input
          type="date"
          value={filters.to}
          aria-label="To date"
          onChange={(event) => patchFilter("to", event.target.value)}
        />
        <button className="btn" onClick={clearFilters}>
          Clear
        </button>
      </section>

      {(mode === "employees" || mode === "reports") && (
        <section className="report-grid">
          <article className="report-box">
            <h3>Employee compensation</h3>
            <p>
              Salary / Wages plus Staff Commission / Bonus, grouped by the employee receiving the money. Use the year
              selector to compare one year at a time.
            </p>
            <div className="employee-grid">
              {allPayoutsForSelectedYear.slice(0, 10).map((item) => (
                <div className="employee-card" key={item.person}>
                  <button onClick={() => recallEmployee(item.person)}>{item.person}</button>
                  <strong>{money(item.total)}</strong>
                  <small>
                    Salary {money(item.salary)} · Bonus {money(item.bonus)} · {item.records} entries
                  </small>
                </div>
              ))}
              {!allPayoutsForSelectedYear.length && <div className="loading">No named employee payouts in this period.</div>}
            </div>
            <div className="policy-note">
              Management policy: historical Eng Rony personal-draw entries that explicitly identify Rony/Nisha, plus
              every historical Private Car / Vehicle expense, are allocated to Eng Rony under Salary / Wages for
              internal employee-cost analysis. The original transaction description and original ledger category remain
              available in the source database; this reporting allocation does not rewrite the source evidence.
            </div>
          </article>
          <article className="report-box">
            <h3>{mode === "employees" ? "Selected employee view" : "Report builder"}</h3>
            <p>
              The PDF uses the active filters above. Choose a preset, refine the period or employee, then generate the
              branded statement.
            </p>
            <div className="report-presets">
              <button onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); }}>Full ledger</button>
              <button onClick={() => { setFilters((current) => ({ ...EMPTY_FILTERS, year: current.year, category: "Salary / Wages" })); setPage(0); }}>Salary & wages</button>
              <button onClick={() => { setFilters((current) => ({ ...EMPTY_FILTERS, year: current.year, category: "Staff Commission / Bonus" })); setPage(0); }}>Staff commission</button>
              <button onClick={() => { setFilters((current) => ({ ...EMPTY_FILTERS, year: current.year, person: "Eng Rony" })); setMode("employees"); setPage(0); }}>Eng Rony payouts</button>
              <button onClick={() => { const now = new Date(); setFilters({ ...EMPTY_FILTERS, year: String(now.getFullYear()), from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: dateKey(now) }); setPage(0); }}>This month</button>
            </div>
            <div style={{ height: 12 }} />
            <div className="month-stats">
              <div><span>CURRENT MONTH INCOME</span><b>{money(currentMonth.income)}</b></div>
              <div><span>CURRENT MONTH EXPENSE</span><b>{money(currentMonth.expense)}</b></div>
              <div><span>CURRENT MONTH NET</span><b>{money(currentMonth.net)}</b></div>
            </div>
          </article>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{panelTitle}</h2>
            <span>{filteredRows.length.toLocaleString("en-BD")} matching transactions</span>
          </div>
          <span>
            {filters.year && <b style={{ color: "#ef7a72" }}>{filters.year}</b>}
            {filters.fileId && <> · Project <b style={{ color: "#ef7a72" }}>{filters.fileId}</b></>}
          </span>
        </div>

        {loading ? (
          <div className="loading">Loading income and expense database…</div>
        ) : (
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>File</th>
                  <th>Transaction</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Person / source</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td>
                      {displayDate(row.date)}
                      <span className="sub">{row.id}</span>
                    </td>
                    <td><span className={`type ${row.type.toLowerCase()}`}>{row.type}</span></td>
                    <td>
                      {row.fileId ? (
                        <button className="file-button" onClick={() => recallFile(row.fileId)}>{row.fileId}</button>
                      ) : "—"}
                      <span className="sub">{row.projectName}</span>
                    </td>
                    <td>
                      <div className="desc">{row.description}</div>
                      <span className="sub">{row.clientName}</span>
                      {row.allocationNote && <span className="allocation">{row.allocationNote}</span>}
                    </td>
                    <td>
                      {row.category}
                      {row.rawCategory !== row.category && <span className="sub">Source: {row.rawCategory}</span>}
                    </td>
                    <td>
                      <b className={`amount ${row.type.toLowerCase()}`}>{money(row.amount)}</b>
                      <span className="sub">{row.paymentMethod}</span>
                    </td>
                    <td><span className="status">{row.status}</span></td>
                    <td>
                      {row.type === "Income" ? (
                        row.receivedFrom || row.receivedBy || "Not recorded"
                      ) : row.paidTo ? (
                        <button className="person-button" onClick={() => recallEmployee(row.paidTo)}>{row.paidTo}</button>
                      ) : (
                        row.requestedBy || "Not recorded"
                      )}
                      <span className="sub">
                        {row.type === "Expense" && row.approvedBy ? `Approved: ${row.approvedBy}` : row.source}
                      </span>
                    </td>
                    <td>{row.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <div className="loading">No transactions match the current filters.</div>}
          </div>
        )}

        <footer className="footer">
          <span>Page {currentPage + 1} of {pages}</span>
          <div>
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </footer>
      </section>
    </main>
  );
}
