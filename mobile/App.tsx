import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { clearSession, clientLogin, getView, login, mobileAction, MobileUser, storedUser } from "./src/api";

type Tab = "Home" | "Projects" | "Visits" | "Expenses" | "Team";
type Row = Record<string, any>;

const C = {
  bg: "#0b1015", panel: "#121920", panel2: "#18212a", line: "#2a353f", text: "#f2f5f7", muted: "#8b98a3",
  red: "#d9272e", green: "#4e9d68", amber: "#d7a83e", blue: "#5d8fc3", white: "#ffffff",
};

function roleOf(user: MobileUser | null) { return String(user?.role || user?.Role || "").toLowerCase(); }
function userName(user: MobileUser | null) { return String(user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW"); }
function userCode(user: MobileUser | null) { return String(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID || ""); }
function money(value: unknown) { return `BDT ${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`; }
function fmtDate(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "red" }) {
  const bg = tone === "green" ? C.green : tone === "amber" ? C.amber : tone === "red" ? C.red : C.blue;
  return <View style={[s.badge, { backgroundColor: `${bg}22`, borderColor: `${bg}88` }]}><Text style={[s.badgeText, { color: bg }]}>{children}</Text></View>;
}

function LoginScreen({ onLogin }: { onLogin: (u: MobileUser) => void }) {
  const [mode, setMode] = useState<"staff" | "client">("staff");
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!id.trim() || !secret.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const session = mode === "staff" ? await login(id.trim(), secret) : await clientLogin(id.trim(), secret);
      onLogin(session.user);
    } catch (e: any) { setError(e?.message || "Sign in failed."); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={s.safe}><StatusBar style="light"/><View style={s.loginWrap}>
    <View style={s.brandMark}><Text style={s.brandLV}>LV</Text></View>
    <Text style={s.loginTitle}>LAND VIEW</Text><Text style={s.loginSub}>Architects & Engineers · Mobile Workspace</Text>
    <View style={s.modeRow}>
      <Pressable style={[s.modeBtn, mode === "staff" && s.modeBtnActive]} onPress={() => setMode("staff")}><Text style={[s.modeText, mode === "staff" && s.modeTextActive]}>STAFF</Text></Pressable>
      <Pressable style={[s.modeBtn, mode === "client" && s.modeBtnActive]} onPress={() => setMode("client")}><Text style={[s.modeText, mode === "client" && s.modeTextActive]}>CLIENT</Text></Pressable>
    </View>
    <View style={s.loginCard}>
      <Text style={s.label}>{mode === "staff" ? "USER ID" : "FILE ID"}</Text>
      <TextInput autoCapitalize="characters" value={id} onChangeText={setId} placeholder={mode === "staff" ? "EMP-0004 or admin" : "LV-157"} placeholderTextColor="#58636d" style={s.input}/>
      <Text style={s.label}>{mode === "staff" ? "PASSWORD" : "REGISTERED MOBILE"}</Text>
      <TextInput secureTextEntry={mode === "staff"} keyboardType={mode === "client" ? "phone-pad" : "default"} value={secret} onChangeText={setSecret} placeholder={mode === "staff" ? "Password" : "01XXXXXXXXX"} placeholderTextColor="#58636d" style={s.input}/>
      {!!error && <Text style={s.error}>{error}</Text>}
      <Pressable style={[s.primary, busy && { opacity: .55 }]} onPress={() => void submit()} disabled={busy}><Text style={s.primaryText}>{busy ? "SIGNING IN…" : "SIGN IN"}</Text></Pressable>
    </View>
    <Text style={s.privacy}>Secure LAND VIEW account · GPS is requested only for site verification actions.</Text>
  </View></SafeAreaView>;
}

function Home({ user, openTab }: { user: MobileUser; openTab: (tab: Tab) => void }) {
  const [data, setData] = useState<Row | null>(null); const [loading, setLoading] = useState(true); const [sharing, setSharing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setData(await getView("dashboard")); setError(""); } catch (e: any) { setError(e?.message || "Could not load dashboard."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const role = roleOf(user); const check = data?.pendingLocationCheck;

  async function shareLocation() {
    setSharing(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { await mobileAction("respond-location-check", { denied: true }); await load(); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await mobileAction("respond-location-check", { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? 999 });
      await load();
    } catch (e: any) { Alert.alert("Location check", e?.message || "Could not verify location."); }
    finally { setSharing(false); }
  }

  if (loading && !data) return <CenterLoading/>;
  return <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.red}/> }>
    <Text style={s.eyebrow}>{role.toUpperCase()} COMMAND CENTER</Text><Text style={s.h1}>Welcome, {userName(user)}</Text><Text style={s.sub}>{userCode(user)} · LAND VIEW mobile workspace</Text>
    {!!error && <Text style={s.errorBox}>{error}</Text>}
    {role === "employee" && check?.status === "PENDING" && <View style={s.alertCard}><Badge tone="amber">LOCATION CHECK</Badge><Text style={s.alertTitle}>Management requested a site verification</Text><Text style={s.alertCopy}>Request expires {fmtDate(check.expiresAt)}. Your GPS is compared with registered LAND VIEW sites; unrelated exact coordinates are not kept in the check record.</Text><Pressable style={s.primary} onPress={() => void shareLocation()} disabled={sharing}><Text style={s.primaryText}>{sharing ? "CHECKING GPS…" : "SHARE LOCATION NOW"}</Text></Pressable></View>}
    <View style={s.statsRow}><Stat label="PROJECTS" value={data?.stats?.projectCount ?? 0}/><Stat label="ACTIVE" value={data?.stats?.activeProjectCount ?? 0}/><Stat label="RECENT VISITS" value={data?.stats?.recentVisitCount ?? 0}/></View>
    <Text style={s.sectionTitle}>Quick access</Text>
    <View style={s.quickGrid}>{(["Projects","Visits", ...(role === "client" ? [] : ["Expenses"]), ...(["admin","manager"].includes(role) ? ["Team"] : [])] as Tab[]).map(tab => <Pressable key={tab} style={s.quick} onPress={() => openTab(tab)}><Text style={s.quickText}>{tab}</Text><Text style={s.quickArrow}>→</Text></Pressable>)}</View>
    <Text style={s.sectionTitle}>Recent projects</Text>{(data?.projects || []).map((p: Row) => <ProjectCard key={p.projectId} row={p}/>)}
  </ScrollView>;
}

function Stat({ label, value }: { label: string; value: number }) { return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>; }
function ProjectCard({ row }: { row: Row }) { return <View style={s.card}><View style={s.cardTop}><Text style={s.cardCode}>{row.projectId}</Text><Badge tone={row.currentStage === "Completed" ? "green" : "blue"}>{row.currentStage || "Project"}</Badge></View><Text style={s.cardTitle}>{row.projectName || row.clientName || "Project"}</Text><Text style={s.cardCopy}>{row.clientName || ""}{row.location ? ` · ${row.location}` : ""}</Text></View>; }

function DataList({ view, user }: { view: string; user: MobileUser }) {
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const data = await getView(view); setRows(Array.isArray(data) ? data : []); setError(""); } catch (e: any) { setError(e?.message || `Could not load ${view}.`); } finally { setLoading(false); } }, [view]);
  useEffect(() => { void load(); }, [load]);
  if (loading && !rows.length) return <CenterLoading/>;
  return <View style={s.screen}><View style={s.listHead}><Text style={s.h1}>{view === "site-visits" ? "Site Visits" : view[0].toUpperCase() + view.slice(1)}</Text><Text style={s.sub}>{rows.length} records</Text></View>{!!error && <Text style={s.errorBox}>{error}</Text>}<FlatList data={rows} keyExtractor={(r, i) => String(r.projectId || r.visitId || r.expenseId || i)} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.red}/>} contentContainerStyle={s.listPad} renderItem={({ item }) => view === "projects" ? <ProjectCard row={item}/> : view === "site-visits" ? <View style={s.card}><View style={s.cardTop}><Text style={s.cardCode}>{item.projectId || item.visitId}</Text><Badge tone={String(item.locationStatus).includes("VERIFIED") ? "green" : "blue"}>{item.status || "Visit"}</Badge></View><Text style={s.cardTitle}>{item.purpose || "Site Visit"}</Text><Text style={s.cardCopy}>{item.projectName || ""} · {item.date || ""}</Text>{item.observations ? <Text style={s.cardCopy}>{item.observations}</Text> : null}</View> : <View style={s.card}><View style={s.cardTop}><Text style={s.cardCode}>{item.expenseId}</Text><Badge tone={String(item.status).toLowerCase().includes("approved") ? "green" : "amber"}>{item.status || "Expense"}</Badge></View><Text style={s.cardTitle}>{money(item.amount)}</Text><Text style={s.cardCopy}>{item.category || "Expense"} · {item.description || ""}</Text><Text style={s.cardCopy}>{item.date || ""}{item.projectId ? ` · ${item.projectId}` : ""}</Text></View>}/></View>;
}

function Team({ user }: { user: MobileUser }) {
  const [rows, setRows] = useState<Row[]>([]); const [checks, setChecks] = useState<Record<string, Row>>({}); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const [employees, checkRows] = await Promise.all([getView("employees"), getView("location-check")]); setRows(Array.isArray(employees) ? employees : []); const map: Record<string, Row> = {}; for (const r of Array.isArray(checkRows) ? checkRows : []) if (r?.employeeCode) map[String(r.employeeCode).toUpperCase()] = r; setChecks(map); } catch (e: any) { Alert.alert("Team", e?.message || "Could not load employees."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!Object.values(checks).some(x => x?.status === "PENDING")) return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [checks, load]);
  async function request(code: string) { setBusy(code); try { await mobileAction("request-location-check", { employeeCode: code }); await load(); } catch (e: any) { Alert.alert("Location check", e?.message || "Request failed."); } finally { setBusy(""); } }
  return <View style={s.screen}><View style={s.listHead}><Text style={s.h1}>Team</Text><Text style={s.sub}>Employees & site verification</Text></View><FlatList data={rows} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.red}/>} keyExtractor={r => String(r.employeeId)} contentContainerStyle={s.listPad} renderItem={({ item }) => { const check = checks[String(item.employeeId).toUpperCase()]; const status = check?.status || "NOT_CHECKED"; return <View style={s.card}><View style={s.cardTop}><Text style={s.cardCode}>{item.employeeId}</Text><Badge tone={status === "VERIFIED_SITE" ? "green" : status === "PENDING" ? "amber" : status === "NOT_NEAR_SITE" ? "red" : "blue"}>{status.replaceAll("_", " ")}</Badge></View><Text style={s.cardTitle}>{item.name}</Text><Text style={s.cardCopy}>{item.designation || item.department || "Employee"}</Text>{check?.matchedProjectCode ? <Text style={s.cardCopy}>{check.matchedProjectCode} · {Math.round(Number(check.distanceM || 0))} m · GPS ±{Math.round(Number(check.accuracyM || 0))} m</Text> : null}<Pressable style={[s.secondary, (status === "PENDING" || busy === item.employeeId) && { opacity: .5 }]} disabled={status === "PENDING" || busy === item.employeeId} onPress={() => void request(item.employeeId)}><Text style={s.secondaryText}>{status === "PENDING" ? "WAITING FOR EMPLOYEE" : busy === item.employeeId ? "REQUESTING…" : "CHECK LOCATION"}</Text></Pressable></View>; }}/></View>;
}

function CenterLoading() { return <View style={s.center}><ActivityIndicator color={C.red}/><Text style={s.sub}>Loading LAND VIEW…</Text></View>; }

export default function App() {
  const [user, setUser] = useState<MobileUser | null>(null); const [booting, setBooting] = useState(true); const [tab, setTab] = useState<Tab>("Home");
  useEffect(() => { void storedUser().then(setUser).finally(() => setBooting(false)); }, []);
  const role = roleOf(user);
  const tabs = useMemo<Tab[]>(() => ["Home", "Projects", "Visits", ...(role === "client" ? [] : ["Expenses"] as Tab[]), ...(["admin", "manager"].includes(role) ? ["Team"] as Tab[] : [])], [role]);
  if (booting) return <SafeAreaView style={s.safe}><CenterLoading/></SafeAreaView>;
  if (!user) return <LoginScreen onLogin={(u) => { setUser(u); setTab("Home"); }}/>;
  async function logout() { await clearSession(); setUser(null); setTab("Home"); }
  return <SafeAreaView style={s.safe}><StatusBar style="light"/><RNStatusBar barStyle="light-content" backgroundColor={C.bg}/><View style={s.topbar}><View><Text style={s.brandSmall}>LAND VIEW</Text><Text style={s.topName}>{userName(user)}</Text></View><Pressable onPress={() => void logout()}><Text style={s.logout}>SIGN OUT</Text></Pressable></View><View style={{ flex: 1 }}>{tab === "Home" ? <Home user={user} openTab={setTab}/> : tab === "Projects" ? <DataList view="projects" user={user}/> : tab === "Visits" ? <DataList view="site-visits" user={user}/> : tab === "Expenses" ? <DataList view="expenses" user={user}/> : <Team user={user}/>}</View><View style={s.nav}>{tabs.map(item => <Pressable key={item} onPress={() => setTab(item)} style={s.navItem}><Text style={[s.navText, tab === item && s.navActive]}>{item.toUpperCase()}</Text>{tab === item && <View style={s.navDot}/>}</Pressable>)}</View></SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg}, screen:{flex:1,backgroundColor:C.bg}, pad:{padding:18,paddingBottom:30}, center:{flex:1,alignItems:"center",justifyContent:"center",gap:12,backgroundColor:C.bg},
  loginWrap:{flex:1,justifyContent:"center",padding:24,backgroundColor:C.bg},brandMark:{width:62,height:62,borderRadius:18,backgroundColor:C.red,alignItems:"center",justifyContent:"center",marginBottom:16},brandLV:{color:C.white,fontWeight:"900",fontSize:24},loginTitle:{fontSize:31,fontWeight:"900",letterSpacing:2,color:C.text},loginSub:{marginTop:5,color:C.muted,fontSize:12},modeRow:{flexDirection:"row",marginTop:28,backgroundColor:C.panel,borderRadius:10,padding:4},modeBtn:{flex:1,padding:10,alignItems:"center",borderRadius:7},modeBtnActive:{backgroundColor:C.red},modeText:{color:C.muted,fontSize:10,fontWeight:"900"},modeTextActive:{color:C.white},loginCard:{marginTop:12,padding:18,borderWidth:1,borderColor:C.line,borderRadius:16,backgroundColor:C.panel},label:{fontSize:9,fontWeight:"900",letterSpacing:1,color:C.muted,marginBottom:6,marginTop:6},input:{height:46,borderWidth:1,borderColor:C.line,borderRadius:9,backgroundColor:C.bg,color:C.text,paddingHorizontal:12,fontSize:14,marginBottom:10},primary:{minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:9,backgroundColor:C.red,marginTop:10,paddingHorizontal:14},primaryText:{fontSize:10,fontWeight:"900",color:C.white,letterSpacing:.6},privacy:{color:C.muted,fontSize:9,lineHeight:14,textAlign:"center",marginTop:16},error:{color:"#ff858a",fontSize:10,marginTop:4},errorBox:{backgroundColor:"#351719",borderColor:"#6b292c",borderWidth:1,borderRadius:8,padding:10,color:"#ff969a",fontSize:10,marginVertical:10},
  topbar:{height:66,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18,borderBottomWidth:1,borderBottomColor:C.line,backgroundColor:C.panel},brandSmall:{fontSize:9,fontWeight:"900",letterSpacing:1.4,color:C.red},topName:{fontSize:13,fontWeight:"800",color:C.text,marginTop:3},logout:{fontSize:9,fontWeight:"900",color:C.muted},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.3,color:C.red},h1:{fontSize:25,fontWeight:"900",color:C.text,marginTop:5},sub:{fontSize:10,color:C.muted,marginTop:4},
  alertCard:{borderWidth:1,borderColor:"#72551e",borderRadius:13,backgroundColor:"#251e10",padding:15,marginTop:18},alertTitle:{fontSize:15,fontWeight:"900",color:C.text,marginTop:10},alertCopy:{fontSize:10,lineHeight:16,color:"#c7b78f",marginTop:7},statsRow:{flexDirection:"row",gap:8,marginTop:18},stat:{flex:1,padding:13,borderRadius:12,borderWidth:1,borderColor:C.line,backgroundColor:C.panel},statValue:{fontSize:22,fontWeight:"900",color:C.text},statLabel:{fontSize:8,fontWeight:"900",color:C.muted,marginTop:4},sectionTitle:{fontSize:12,fontWeight:"900",color:C.text,marginTop:22,marginBottom:10},quickGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},quick:{width:"48%",minHeight:54,borderRadius:11,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:13},quickText:{fontSize:11,fontWeight:"800",color:C.text},quickArrow:{fontSize:15,color:C.red},
  card:{padding:14,borderRadius:12,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,marginBottom:9},cardTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},cardCode:{fontSize:9,fontWeight:"900",letterSpacing:.8,color:C.red},cardTitle:{fontSize:14,fontWeight:"800",color:C.text,marginTop:8},cardCopy:{fontSize:10,lineHeight:15,color:C.muted,marginTop:4},badge:{borderWidth:1,borderRadius:999,paddingVertical:4,paddingHorizontal:8},badgeText:{fontSize:8,fontWeight:"900"},listHead:{padding:18,paddingBottom:8},listPad:{padding:18,paddingTop:8,paddingBottom:28},secondary:{marginTop:11,minHeight:38,borderWidth:1,borderColor:C.line,borderRadius:8,alignItems:"center",justifyContent:"center",backgroundColor:C.panel2},secondaryText:{fontSize:9,fontWeight:"900",color:C.text},
  nav:{minHeight:62,flexDirection:"row",borderTopWidth:1,borderTopColor:C.line,backgroundColor:C.panel,paddingBottom:4},navItem:{flex:1,alignItems:"center",justifyContent:"center",position:"relative"},navText:{fontSize:8,fontWeight:"800",color:C.muted},navActive:{color:C.text},navDot:{position:"absolute",bottom:7,width:18,height:2,borderRadius:2,backgroundColor:C.red},
});
