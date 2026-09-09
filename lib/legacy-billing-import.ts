import * as XLSX from "xlsx";

export type LegacyProjectRow = Record<string, string | number>;
export type LegacyBillRow = Record<string, string | number>;
export type LegacyPaymentRow = Record<string, string | number>;

export type LegacyBillingImport = {
  projects: LegacyProjectRow[];
  bills: LegacyBillRow[];
  payments: LegacyPaymentRow[];
};

type CellValue = string | number | boolean | Date | null | undefined;

function text(value: CellValue) {
  return String(value ?? "").trim();
}

function numberValue(value: CellValue) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectId(value: CellValue) {
  const raw = text(value).replace(/^LV-/i, "");
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric)) return "";
  return `LV-${String(Math.trunc(numeric)).padStart(4, "0")}`;
}

function dateValue(value: CellValue) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Math.round(value * 86400000));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return text(value);
}

function rows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Required worksheet “${sheetName}” was not found.`);
  return XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
}

function billRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  category: string,
  supervision = false
) {
  return rows(workbook, sheetName).slice(1).flatMap((row, index) => {
    const id = projectId(row[0]);
    const service = text(row[2]);
    const price = numberValue(row[3]);
    const quantity = numberValue(row[4]);
    const amount = numberValue(row[5]);
    const discount = supervision ? numberValue(row[6]) : 0;
    const billDate = supervision ? dateValue(row[3]) : "";

    if (!id || (!service && !amount && !discount)) return [];

    return [{
      Project_ID: id,
      Category: category,
      Service_Name: service || `${category} service`,
      Bill_Date: billDate,
      Price: supervision ? 0 : price,
      Quantity: quantity,
      Amount: amount,
      Discount: discount,
      Legacy_Source_ID: `${sheetName}:${index + 2}`,
    }];
  });
}

function paymentRows(workbook: XLSX.WorkBook, sheetName: string, category: string) {
  return rows(workbook, sheetName).slice(1).flatMap((row, index) => {
    const id = projectId(row[0]);
    const amount = numberValue(row[4]);
    const details = text(row[3]);
    const date = dateValue(row[2]);

    if (!id || (!amount && !details && !date)) return [];

    return [{
      Project_ID: id,
      Category: category,
      Payment_Date: date,
      Description: details || `${category} deposit`,
      Amount: amount,
      Legacy_Source_ID: `${sheetName}:${index + 2}`,
    }];
  });
}

export function parseLegacyBillingWorkbook(buffer: ArrayBuffer): LegacyBillingImport {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const summaryRows = rows(workbook, "Summary");
  const lastCalledById = new Map<string, string>();

  summaryRows.slice(1).forEach((row) => {
    const id = projectId(row[0]);
    if (id && row[17]) lastCalledById.set(id, dateValue(row[17]));
  });

  const fileRows = rows(workbook, "File List");
  const projects = fileRows.slice(1).flatMap((row) => {
    const id = projectId(row[0]);
    const clientName = text(row[1]);
    const phone = text(row[3]);
    const location = text(row[2]);

    if (!id || (!clientName && !phone && !location)) return [];

    return [{
      Project_ID: id,
      Project_Name: clientName ? `${clientName} Project` : id,
      Client_Name: clientName,
      Location: location,
      Phone_Number: phone,
      Floors: text(row[4]),
      Project_Type: text(row[5]),
      Plot_Area: text(row[6]),
      Design_Discount: numberValue(row[7]),
      Last_Called: lastCalledById.get(id) || "",
      Status: "Imported",
      Legacy_File_ID: text(row[0]),
    }];
  });

  const projectIds = new Set(projects.map((project) => String(project.Project_ID)));
  const bills = [
    ...billRows(workbook, "Design Bill", "Design"),
    ...billRows(workbook, "Supervision Bill", "Supervision", true),
    ...billRows(workbook, "Others Bill", "Other Services"),
  ].filter((bill) => projectIds.has(String(bill.Project_ID)));

  const designDiscountByProject = new Map(
    projects
      .filter((project) => numberValue(project.Design_Discount) > 0)
      .map((project) => [String(project.Project_ID), numberValue(project.Design_Discount)])
  );

  for (const [id, discount] of designDiscountByProject) {
    const firstDesignBill = bills.find(
      (bill) => bill.Project_ID === id && bill.Category === "Design"
    );
    if (firstDesignBill) firstDesignBill.Discount = numberValue(firstDesignBill.Discount) + discount;
    else bills.push({
      Project_ID: id,
      Category: "Design",
      Service_Name: "Design discount",
      Bill_Date: "",
      Price: 0,
      Quantity: 0,
      Amount: 0,
      Discount: discount,
      Legacy_Source_ID: `File List:${id}:discount`,
    });
  }

  const payments = [
    ...paymentRows(workbook, "Design Deposit", "Design"),
    ...paymentRows(workbook, "S Deposit", "Supervision"),
    ...paymentRows(workbook, "Others Bill Deposit", "Other Services"),
  ].filter((payment) => projectIds.has(String(payment.Project_ID)));

  return { projects, bills, payments };
}
