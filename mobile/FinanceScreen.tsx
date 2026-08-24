import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Row = Record<string, any>;

type Props = {
  onBack: () => void;
  projectId?: string;
};

const API_URL = "https://app.landview.com.bd/api/landview";

async function api(action: string, payload: Record<string, unknown> = {}) {
  const url = `${API_URL}?${new URLSearchParams({
    action,
    ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, String(value)])),
  }).toString()}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const json = await response.json();
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || json?.message || "Could not load finance data.");
  }
  return json?.data ?? json;
}

function pick(row: Row | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

function money(value: any) {
  const number = Number(value || 0);
  return `৳${Number.isFinite(number) ? number.toLocaleString("en-BD", { maximumFractionDigits: 2 }) : "0"}`;
}

function formatDate(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>FINANCE</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>
  );
}

function invoicePdfUrl(invoice: Row) {
  return pick(invoice, ["PDF_URL", "Invoice_PDF_URL", "File_URL", "pdfUrl"], "");
}

export default function FinanceScreen({ onBack, projectId }: Props) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 900;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<Row | null>(null);
  const [billing, setBilling] = useState<Row | null>(null);
  const [payments, setPayments] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        if (projectId) {
          const [projectBilling, paymentRows, invoiceRows] = await Promise.all([
            api("getProjectBilling", { projectId }),
            api("getPayments", { projectId }),
            api("getInvoices", { projectId }),
          ]);
          if (!cancelled) {
            setBilling(projectBilling || {});
            setPayments(Array.isArray(paymentRows) ? paymentRows : []);
            setInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
          }
        } else {
          const [dash, paymentRows, invoiceRows] = await Promise.all([
            api("getBillingDashboard"),
            api("getPayments"),
            api("getInvoices"),
          ]);
          if (!cancelled) {
            setDashboard(dash || {});
            setPayments(Array.isArray(paymentRows) ? paymentRows : []);
            setInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not load finance.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const filteredPayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return payments;
    return payments.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [payments, query]);

  const summary = projectId
    ? {
        totalBill: billing?.totalBill || 0,
        totalPaid: billing?.totalPaid || 0,
        pending: billing?.due || 0,
        projectCount: 1,
        billCount: Array.isArray(billing?.bills) ? billing.bills.length : 0,
        paymentCount: payments.length,
      }
    : {
        totalBill: dashboard?.totalBill || 0,
        totalPaid: dashboard?.totalPaid || 0,
        pending: dashboard?.pending || 0,
        projectCount: dashboard?.projectCount || 0,
        billCount: dashboard?.billCount || 0,
        paymentCount: dashboard?.paymentCount || 0,
      };

  const bills = projectId && Array.isArray(billing?.bills) ? billing.bills : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.page, wide && styles.pageWide]}>
          <Header title={projectId ? `${projectId} Billing` : "Finance"} onBack={onBack} />

          {loading ? (
            <View style={styles.state}><ActivityIndicator color="#EF4A3C" /><Text style={styles.muted}>Loading finance...</Text></View>
          ) : error ? (
            <View style={styles.state}><Text style={styles.error}>{error}</Text></View>
          ) : (
            <>
              <View style={styles.statsGrid}>
                <Stat label="TOTAL BILLED" value={money(summary.totalBill)} detail={`${summary.billCount} bill records`} />
                <Stat label="TOTAL PAID" value={money(summary.totalPaid)} detail={`${summary.paymentCount} payments`} />
                <Stat label="OUTSTANDING" value={money(summary.pending)} detail="Billed less paid" />
                <Stat label={projectId ? "PROJECT" : "PROJECTS"} value={projectId || String(summary.projectCount)} detail={projectId ? "Current project" : "Finance scope"} />
              </View>

              <View style={styles.searchBox}>
                <TextInput value={query} onChangeText={setQuery} placeholder="Search payments..." style={styles.searchInput} />
                <Text style={styles.count}>{filteredPayments.length} PAYMENT RECORDS</Text>
              </View>

              <Text style={styles.sectionTitle}>Recent payments</Text>
              {!filteredPayments.length ? <View style={styles.empty}><Text style={styles.muted}>No payment records yet.</Text></View> : (
                <View style={styles.list}>
                  {[...filteredPayments].reverse().slice(0, 20).map((row, index) => (
                    <View key={`${pick(row, ["Payment_ID"], "payment")}-${index}`} style={styles.rowCard}>
                      <View style={styles.rowTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowKicker}>{pick(row, ["Payment_ID"], "PAYMENT")}</Text>
                          <Text style={styles.rowTitle}>{pick(row, ["Project_ID"], projectId || "—")}</Text>
                        </View>
                        <Text style={styles.amount}>{money(row.Amount || row.Payment_Amount)}</Text>
                      </View>
                      <Text style={styles.rowMeta}>{formatDate(row.Date || row.Payment_Date)}</Text>
                      {pick(row, ["Notes", "Description"], "") ? <Text style={styles.rowNote}>{pick(row, ["Notes", "Description"])}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {projectId ? (
                <>
                  <Text style={styles.sectionTitle}>Bill records</Text>
                  {!bills.length ? <View style={styles.empty}><Text style={styles.muted}>No bills yet.</Text></View> : (
                    <View style={styles.list}>
                      {[...bills].reverse().map((row, index) => (
                        <View key={`${pick(row, ["Bill_ID"], "bill")}-${index}`} style={styles.rowCard}>
                          <View style={styles.rowTop}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowKicker}>{pick(row, ["Bill_ID"], "BILL")}</Text>
                              <Text style={styles.rowTitle}>{pick(row, ["Description", "Particulars", "Item"], "Bill record")}</Text>
                            </View>
                            <Text style={styles.amount}>{money(row.Amount || row.Bill_Amount || row.Total || row.Grand_Total)}</Text>
                          </View>
                          <Text style={styles.rowMeta}>{formatDate(row.Date || row.Bill_Date || row.Created_At)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : null}

              <Text style={styles.sectionTitle}>Invoices</Text>
              {!invoices.length ? <View style={styles.empty}><Text style={styles.muted}>No invoices generated yet.</Text></View> : (
                <View style={styles.list}>
                  {[...invoices].reverse().slice(0, 20).map((row, index) => {
                    const pdf = invoicePdfUrl(row);
                    return (
                      <View key={`${pick(row, ["Invoice_ID"], "invoice")}-${index}`} style={styles.rowCard}>
                        <View style={styles.rowTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowKicker}>{pick(row, ["Invoice_ID"], "INVOICE")}</Text>
                            <Text style={styles.rowTitle}>{pick(row, ["Project_ID"], projectId || "—")}</Text>
                          </View>
                          <Text style={styles.invoiceStatus}>{pick(row, ["Status"], "Generated")}</Text>
                        </View>
                        <Text style={styles.rowMeta}>{formatDate(row.Invoice_Date || row.Date)}</Text>
                        <View style={styles.balanceRow}><Text style={styles.muted}>Balance due</Text><Text style={styles.amount}>{money(row.Due_Amount ?? row.due ?? 0)}</Text></View>
                        {pdf ? <Pressable style={styles.openButton} onPress={() => Linking.openURL(pdf)}><Text style={styles.openButtonText}>OPEN INVOICE ↗</Text></Pressable> : <Text style={styles.noFile}>No PDF attached</Text>}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F1EB" },
  scroll: { flexGrow: 1, paddingBottom: 42 },
  page: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 22 },
  pageWide: { maxWidth: 1180 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  backButton: { width: 44, height: 44, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D5CFC6", alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 22, fontWeight: "800", color: "#1F1F1D" },
  kicker: { color: "#EF4A3C", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  title: { fontSize: 30, fontWeight: "900", color: "#1F1F1D", marginTop: 4 },
  state: { minHeight: 180, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  error: { color: "#B42318", textAlign: "center", fontWeight: "700" },
  muted: { color: "#777168" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: { flexGrow: 1, flexBasis: 155, minHeight: 125, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 18 },
  statLabel: { color: "#918A80", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  statValue: { color: "#1F1F1D", fontSize: 24, fontWeight: "900", marginTop: 13 },
  statDetail: { color: "#777168", fontSize: 11, marginTop: 7 },
  searchBox: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 12, marginTop: 22 },
  searchInput: { height: 48, backgroundColor: "#F8F6F2", paddingHorizontal: 14, fontSize: 15 },
  count: { marginTop: 10, color: "#777168", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  sectionTitle: { fontSize: 20, fontWeight: "900", color: "#1F1F1D", marginTop: 30, marginBottom: 14 },
  empty: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 22 },
  list: { gap: 12 },
  rowCard: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 18 },
  rowTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  rowKicker: { color: "#EF4A3C", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  rowTitle: { fontSize: 17, fontWeight: "900", color: "#1F1F1D", marginTop: 5 },
  rowMeta: { color: "#918A80", fontSize: 11, marginTop: 8 },
  rowNote: { color: "#6F6961", marginTop: 10, lineHeight: 19 },
  amount: { color: "#1F1F1D", fontSize: 17, fontWeight: "900" },
  invoiceStatus: { color: "#5E5A54", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#E8E3DC" },
  openButton: { backgroundColor: "#1F1F1D", paddingVertical: 12, paddingHorizontal: 14, marginTop: 15, alignSelf: "flex-start" },
  openButtonText: { color: "#FFF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  noFile: { color: "#918A80", fontSize: 10, fontWeight: "800", marginTop: 14 },
});