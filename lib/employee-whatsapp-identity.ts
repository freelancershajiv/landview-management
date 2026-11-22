import { selectRows } from "@/lib/supabase-data";

export function normalizeWhatsAppPhone(value: unknown) {
  const raw = String(value ?? "").replace(/\D/g, "");
  const normalized = /^01[3-9]\d{8}$/.test(raw) ? `88${raw}` : /^1[3-9]\d{8}$/.test(raw) ? `880${raw}` : raw;
  return /^8801[3-9]\d{8}$/.test(normalized) ? normalized : "";
}

export async function employeeWhatsAppIdentity(employeeId: string) {
  const [employee] = await selectRows("employees", { filters: { employee_code: employeeId }, limit: 1 });
  return {
    active: String(employee?.status || "").trim().toLowerCase() === "active",
    phone: normalizeWhatsAppPhone(employee?.phone_number),
  };
}
