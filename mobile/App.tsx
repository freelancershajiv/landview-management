import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type SessionUser = {
  userId?: string;
  username?: string;
  name?: string;
  role?: string;
  employeeId?: string;
  projectIds?: string;
};

type DashboardCard = {
  title: string;
  subtitle: string;
  key: string;
};

type ProjectRecord = Record<string, any>;
type AppScreen = "dashboard" | "projects" | "project-detail";

const API_URL = "https://app.landview.com.bd/api/landview";
const SESSION_STORAGE_KEY = "landview.mobile.user";

async function apiRequest(method: "GET" | "POST", action: string, payload: Record<string, unknown> = {}) {
  const url = method === "GET"
    ? `${API_URL}?${new URLSearchParams({ action, ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])) }).toString()}`
    : API_URL;

  const response = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify({ action, ...payload }) : undefined,
    credentials: "include",
  });

  const json = await response.json();
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || json?.message || "LAND VIEW request failed.");
  }
  return json;
}

function pick(record: ProjectRecord | null | undefined, keys: string[], fallback = "") {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

function projectIdOf(project: ProjectRecord) {
  return pick(project, ["Project_ID", "Project ID", "ProjectId"]);
}

function formatDate(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function cardsForRole(role?: string): DashboardCard[] {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin" || normalized === "manager") {
    return [
      { key: "projects", title: "Projects", subtitle: "Manage active and completed projects" },
      { key: "employees", title: "Employees", subtitle: "Manage the LAND VIEW team" },
      { key: "finance", title: "Finance", subtitle: "Billing, payments and invoices" },
      { key: "documents", title: "Documents", subtitle: "Project files and drawings" },
      { key: "site-visits", title: "Site Visits", subtitle: "Supervision and site records" },
      { key: "users", title: "Users", subtitle: "Role and access management" },
    ];
  }
  if (normalized === "employee") {
    return [
      { key: "projects", title: "My Projects", subtitle: "Assigned LAND VIEW projects" },
      { key: "documents", title: "Documents", subtitle: "Drawings and project files" },
      { key: "site-visits", title: "Site Visits", subtitle: "Create and review site records" },
      { key: "profile", title: "Profile", subtitle: "Account and password settings" },
    ];
  }
  return [
    { key: "projects", title: "My Project", subtitle: "Project progress and information" },
    { key: "documents", title: "Documents", subtitle: "Shared drawings and files" },
    { key: "billing", title: "Billing", subtitle: "Invoices, payments and dues" },
    { key: "profile", title: "Profile", subtitle: "Account settings" },
  ];
}

function LoginScreen({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { width } = useWindowDimensions();
  const isWebWide = Platform.OS === "web" && width >= 900;
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!userId.trim() || !password) {
      setError("Enter your User ID and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const json = await apiRequest("POST", "login", { userId: userId.trim(), password });
      const user = json?.data?.user || {};
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      onLogin(user);
    } catch (e: any) {
      setError(e?.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar style="dark" />
      <View style={[styles.loginPage, isWebWide && styles.loginPageWeb]}>
        {isWebWide ? (
          <View style={styles.webIntroPanel}>
            <View style={styles.webIntroAccent} />
            <Text style={styles.webIntroKicker}>LAND VIEW</Text>
            <Text style={styles.webIntroTitle}>Engineering and architecture management, in one workspace.</Text>
            <Text style={styles.webIntroText}>Access projects, team records, documents, site visits and accounts from desktop or mobile.</Text>
            <Text style={styles.webIntroFoot}>ENGINEERS & ARCHITECTS</Text>
          </View>
        ) : null}

        <View style={[styles.loginCard, isWebWide && styles.loginCardWeb]}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>LV</Text></View>
          <Text style={styles.brand}>LAND VIEW</Text>
          <Text style={styles.brandSub}>ENGINEERS & ARCHITECTS</Text>
          <Text style={styles.loginTitle}>Management App</Text>
          <Text style={styles.loginText}>Sign in with your LAND VIEW account.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>USER ID</Text>
            <TextInput value={userId} onChangeText={setUserId} autoCapitalize="none" placeholder="EMP-0001 / Admin ID" placeholderTextColor="#9A948B" style={styles.input} returnKeyType="next" />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••••" placeholderTextColor="#9A948B" style={styles.input} returnKeyType="done" onSubmitEditing={submit} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>SIGN IN</Text>}
            </Pressable>
          </View>
          <Text style={styles.footerText}>LAND VIEW Engineers & Architects</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function DashboardScreen({ user, onLogout, onOpenModule }: { user: SessionUser; onLogout: () => void; onOpenModule: (key: string) => void }) {
  const { width } = useWindowDimensions();
  const cards = useMemo(() => cardsForRole(user.role), [user.role]);
  const isTablet = width >= 720;
  const isDesktop = Platform.OS === "web" && width >= 1080;
  const cardWidth = isDesktop ? "31.7%" : isTablet ? "48.8%" : "100%";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.dashboardScroll}>
        <View style={[styles.dashboard, isDesktop && styles.dashboardDesktop]}>
          <View style={styles.dashboardHeader}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>LAND VIEW</Text>
              <Text style={styles.welcome}>Welcome{user.name ? `, ${user.name}` : ""}</Text>
              <Text style={styles.role}>{String(user.role || "User").toUpperCase()}</Text>
            </View>
            <Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>LOG OUT</Text></Pressable>
          </View>

          <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
            <Text style={styles.heroKicker}>MANAGEMENT SYSTEM</Text>
            <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>Your LAND VIEW workspace, now on mobile and desktop.</Text>
            <Text style={styles.heroText}>Projects, documents, site supervision and accounts in one place.</Text>
          </View>

          <Text style={styles.sectionTitle}>Quick access</Text>
          <View style={styles.cardGrid}>
            {cards.map((card, index) => (
              <Pressable key={card.key} style={({ pressed }) => [styles.menuCard, { width: cardWidth }, pressed && styles.menuCardPressed]} onPress={() => onOpenModule(card.key)}>
                <Text style={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
                <Text style={styles.cardArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScreenHeader({ title, eyebrow, onBack }: { title: string; eyebrow: string; onBack: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backButtonText}>←</Text></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
    </View>
  );
}

function ProjectsScreen({ onBack, onOpenProject }: { onBack: () => void; onOpenProject: (project: ProjectRecord) => void }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const isDesktop = Platform.OS === "web" && width >= 1080;
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const json = await apiRequest("GET", "getProjects");
      setProjects(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setError(e?.message || "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => JSON.stringify(project).toLowerCase().includes(needle));
  }, [projects, query]);

  const cardWidth = isDesktop ? "31.7%" : isTablet ? "48.8%" : "100%";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.dashboardScroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.dashboard, isDesktop && styles.dashboardDesktop]}>
          <ScreenHeader title="Projects" eyebrow="PROJECT CONTROL" onBack={onBack} />

          <View style={styles.searchWrap}>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search project, client, location..." placeholderTextColor="#9A948B" style={styles.searchInput} />
            <Text style={styles.resultCount}>{filtered.length} RECORDS</Text>
          </View>

          {loading ? (
            <View style={styles.stateBox}><ActivityIndicator color="#EF4A3C" /><Text style={styles.stateText}>Loading projects...</Text></View>
          ) : error ? (
            <View style={styles.stateBox}><Text style={styles.error}>{error}</Text><Pressable style={styles.retryButton} onPress={load}><Text style={styles.retryButtonText}>TRY AGAIN</Text></Pressable></View>
          ) : !filtered.length ? (
            <View style={styles.stateBox}><Text style={styles.stateTitle}>No projects found</Text><Text style={styles.stateText}>There are no projects matching this view.</Text></View>
          ) : (
            <View style={styles.cardGrid}>
              {filtered.map((project, index) => {
                const rawId = projectIdOf(project);
                const id = rawId || `Project-${index + 1}`;
                const title = pick(project, ["Project_Name", "Project Name", "Name", "Project_Type", "Project Type"], id);
                const client = pick(project, ["Client_Name", "Client Name", "Client"], "—");
                const location = pick(project, ["Location", "Address", "Project_Location"], "Location not set");
                const status = pick(project, ["Status", "status", "Active"], "Active");
                const stableKey = `${rawId || "project"}-${index}-${pick(project, ["Created_Date", "Created Date", "Start_Date", "Start Date"], "")}`;
                return (
                  <Pressable key={stableKey} onPress={() => onOpenProject(project)} style={({ pressed }) => [styles.projectCard, { width: cardWidth }, pressed && styles.menuCardPressed]}>
                    <View style={styles.projectCardTop}>
                      <Text style={styles.projectIndex}>{String(index + 1).padStart(2, "0")}</Text>
                      <View style={styles.statusBadge}><Text style={styles.statusBadgeText}>{status.toUpperCase()}</Text></View>
                    </View>
                    <Text style={styles.projectTitle}>{title}</Text>
                    <Text style={styles.projectLocation}>{location}</Text>
                    <View style={styles.projectDivider} />
                    <View style={styles.projectMetaRow}><Text style={styles.metaLabel}>PROJECT ID</Text><Text style={styles.metaValue}>{id}</Text></View>
                    <View style={styles.projectMetaRow}><Text style={styles.metaLabel}>CLIENT</Text><Text style={styles.metaValue} numberOfLines={1}>{client}</Text></View>
                    <View style={styles.projectCardFoot}><Text style={styles.projectDate}>{formatDate(project.Start_Date || project["Start Date"] || project.Created_Date)}</Text><Text style={styles.openText}>OPEN →</Text></View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProjectDetailScreen({ projectSeed, onBack }: { projectSeed: ProjectRecord; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1080;
  const projectId = projectIdOf(projectSeed);
  const [project, setProject] = useState<ProjectRecord>(projectSeed);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!projectId) return;
      try {
        const json = await apiRequest("GET", "getProject", { projectId });
        if (!cancelled && json?.data) setProject(json.data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load project details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const title = pick(project, ["Project_Name", "Project Name", "Name", "Project_Type", "Project Type"], projectId || "Project");
  const fields = [
    ["PROJECT ID", projectId || "—"],
    ["CLIENT", pick(project, ["Client_Name", "Client Name", "Client"], "—")],
    ["PROJECT TYPE", pick(project, ["Project_Type", "Project Type"], "—")],
    ["LOCATION", pick(project, ["Location", "Project_Location", "Address"], "—")],
    ["STATUS", pick(project, ["Status", "status"], "—")],
    ["START DATE", formatDate(project.Start_Date || project["Start Date"])],
    ["PLOT AREA", pick(project, ["Plot_Area", "Plot Area", "Project_Area", "Project Area"], "—")],
    ["FLOORS", pick(project, ["Floors", "Number_of_Stories", "Number of Stories"], "—")],
    ["ASSIGNED TEAMS", pick(project, ["Assigned_Teams", "Assigned Teams", "Teams"], "—")],
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.dashboardScroll}>
        <View style={[styles.dashboard, isDesktop && styles.dashboardDesktop]}>
          <ScreenHeader title={title} eyebrow="PROJECT DETAILS" onBack={onBack} />

          {loading ? <View style={styles.inlineLoading}><ActivityIndicator color="#EF4A3C" /><Text style={styles.stateText}>Refreshing project details...</Text></View> : null}
          {error ? <Text style={[styles.error, { marginBottom: 14 }]}>{error}</Text> : null}

          <View style={[styles.detailHero, isDesktop && styles.detailHeroDesktop]}>
            <Text style={styles.heroKicker}>LAND VIEW PROJECT</Text>
            <Text style={styles.detailHeroTitle}>{title}</Text>
            <Text style={styles.detailHeroText}>{pick(project, ["Location", "Project_Location", "Address"], "Project location not set")}</Text>
          </View>

          <Text style={styles.sectionTitle}>Project information</Text>
          <View style={styles.detailGrid}>
            {fields.map(([label, value]) => (
              <View style={styles.detailItem} key={label}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Project modules</Text>
          <View style={styles.cardGrid}>
            {["Documents", "Site Visits", "Billing", "Assigned Team"].map((item) => (
              <Pressable key={item} style={({ pressed }) => [styles.projectModuleCard, pressed && styles.menuCardPressed]} onPress={() => Alert.alert(item, `The ${item} module will be connected next.`)}>
                <Text style={styles.projectModuleTitle}>{item}</Text><Text style={styles.cardArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<AppScreen>("dashboard");
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_STORAGE_KEY)
      .then((saved) => { if (saved) setUser(JSON.parse(saved)); })
      .finally(() => setBooting(false));
  }, []);

  async function logout() {
    try { await apiRequest("POST", "logout"); } catch {}
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    setSelectedProject(null);
    setScreen("dashboard");
    setUser(null);
  }

  function openModule(key: string) {
    if (key === "projects") {
      setScreen("projects");
      return;
    }
    Alert.alert(key.replace(/-/g, " ").toUpperCase(), "This module is ready for the next development step.");
  }

  if (booting) {
    return <SafeAreaProvider><View style={styles.boot}><ActivityIndicator size="large" color="#EF4A3C" /></View></SafeAreaProvider>;
  }

  return (
    <SafeAreaProvider>
      {!user ? (
        <LoginScreen onLogin={(nextUser) => { setUser(nextUser); setScreen("dashboard"); }} />
      ) : screen === "projects" ? (
        <ProjectsScreen onBack={() => setScreen("dashboard")} onOpenProject={(project) => { setSelectedProject(project); setScreen("project-detail"); }} />
      ) : screen === "project-detail" && selectedProject ? (
        <ProjectDetailScreen projectSeed={selectedProject} onBack={() => setScreen("projects")} />
      ) : (
        <DashboardScreen user={user} onLogout={logout} onOpenModule={openModule} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F1EB" },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1EB" },
  loginPage: { flex: 1, justifyContent: "center", backgroundColor: "#F4F1EB", padding: 22 },
  loginPageWeb: { flexDirection: "row", padding: 0, minHeight: "100%" as any },
  webIntroPanel: { width: "52%", backgroundColor: "#1F1F1D", paddingHorizontal: 64, paddingVertical: 60, justifyContent: "center", position: "relative", overflow: "hidden" },
  webIntroAccent: { position: "absolute", width: 420, height: 420, borderRadius: 210, borderWidth: 1, borderColor: "rgba(239,74,60,.28)", right: -110, top: -80 },
  webIntroKicker: { color: "#EF4A3C", fontSize: 12, fontWeight: "900", letterSpacing: 2.5 },
  webIntroTitle: { color: "#FFF", fontSize: 48, lineHeight: 52, fontWeight: "900", maxWidth: 640, marginTop: 18, letterSpacing: -1.5 },
  webIntroText: { color: "#C9C4BC", fontSize: 17, lineHeight: 27, maxWidth: 560, marginTop: 22 },
  webIntroFoot: { color: "#EF4A3C", fontSize: 11, fontWeight: "900", letterSpacing: 2.2, marginTop: 44 },
  loginCard: { width: "100%", maxWidth: 470, alignSelf: "center", paddingHorizontal: 6, paddingVertical: 26 },
  loginCardWeb: { width: "48%", maxWidth: 540, paddingHorizontal: 58, justifyContent: "center" },
  brandMark: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: "#EF4A3C", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  brandMarkText: { color: "#EF4A3C", fontWeight: "900", fontSize: 20 },
  brand: { fontSize: 34, fontWeight: "900", letterSpacing: -1, color: "#1F1F1D" },
  brandSub: { fontSize: 12, fontWeight: "800", letterSpacing: 2.2, color: "#EF4A3C", marginTop: 4 },
  loginTitle: { fontSize: 28, fontWeight: "800", color: "#1F1F1D", marginTop: 42 },
  loginText: { color: "#6B665F", marginTop: 8, marginBottom: 28, fontSize: 15 },
  form: { gap: 10 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, color: "#5C5750", marginTop: 8 },
  input: { height: 54, borderWidth: 1, borderColor: "#D6D0C7", backgroundColor: "#FFF", paddingHorizontal: 16, fontSize: 16, color: "#1F1F1D", borderRadius: 4 },
  error: { color: "#B42318", marginTop: 6, fontWeight: "600" },
  primaryButton: { height: 56, backgroundColor: "#1F1F1D", alignItems: "center", justifyContent: "center", marginTop: 14, borderRadius: 4 },
  primaryButtonText: { color: "#FFF", fontWeight: "900", letterSpacing: 1.5 },
  pressed: { opacity: 0.82 },
  footerText: { textAlign: "center", color: "#918A80", marginTop: 34, fontSize: 12 },
  dashboardScroll: { flexGrow: 1, paddingBottom: 42 },
  dashboard: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 22 },
  dashboardDesktop: { maxWidth: 1260, paddingHorizontal: 34, paddingTop: 30 },
  dashboardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 18 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#EF4A3C", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  welcome: { color: "#1F1F1D", fontSize: 25, fontWeight: "900", marginTop: 6, maxWidth: 720 },
  role: { color: "#777168", fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 6 },
  logoutButton: { borderWidth: 1, borderColor: "#CFC9BF", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 4 },
  logoutText: { fontSize: 10, fontWeight: "900", color: "#1F1F1D", letterSpacing: 1 },
  heroCard: { backgroundColor: "#1F1F1D", padding: 24, minHeight: 210, justifyContent: "flex-end", borderBottomRightRadius: 34 },
  heroCardDesktop: { minHeight: 280, padding: 38 },
  heroKicker: { color: "#EF4A3C", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  heroTitle: { color: "#FFF", fontSize: 29, lineHeight: 32, fontWeight: "900", marginTop: 10, maxWidth: 760 },
  heroTitleDesktop: { fontSize: 46, lineHeight: 49, letterSpacing: -1 },
  heroText: { color: "#CBC7C1", lineHeight: 20, marginTop: 12, maxWidth: 520 },
  sectionTitle: { fontSize: 20, fontWeight: "900", color: "#1F1F1D", marginTop: 30, marginBottom: 14 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  menuCard: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 20, minHeight: 170, position: "relative", borderRadius: 4 },
  menuCardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  cardNumber: { color: "#EF4A3C", fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },
  cardTitle: { fontSize: 22, fontWeight: "900", color: "#1F1F1D", marginTop: 20 },
  cardSubtitle: { color: "#6F6961", marginTop: 6, paddingRight: 40, lineHeight: 20 },
  cardArrow: { position: "absolute", right: 18, bottom: 16, color: "#EF4A3C", fontSize: 24, fontWeight: "700" },
  screenHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  backButton: { width: 44, height: 44, borderWidth: 1, borderColor: "#CFC9BF", alignItems: "center", justifyContent: "center", borderRadius: 4, backgroundColor: "#FFF" },
  backButtonText: { fontSize: 22, color: "#1F1F1D", fontWeight: "800" },
  screenTitle: { fontSize: 30, fontWeight: "900", color: "#1F1F1D", marginTop: 4, letterSpacing: -0.8 },
  searchWrap: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 12, marginBottom: 18, borderRadius: 4 },
  searchInput: { height: 48, paddingHorizontal: 14, color: "#1F1F1D", fontSize: 15, backgroundColor: "#F8F6F2", borderRadius: 4 },
  resultCount: { marginTop: 10, color: "#777168", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  stateBox: { minHeight: 180, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 28, gap: 12 },
  stateTitle: { color: "#1F1F1D", fontSize: 20, fontWeight: "900" },
  stateText: { color: "#777168", textAlign: "center" },
  retryButton: { backgroundColor: "#1F1F1D", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 4 },
  retryButtonText: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  projectCard: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DCD6CD", padding: 20, minHeight: 280, borderRadius: 4 },
  projectCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  projectIndex: { color: "#EF4A3C", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  statusBadge: { borderWidth: 1, borderColor: "#D9D3CA", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: "#F8F6F2" },
  statusBadgeText: { fontSize: 9, fontWeight: "900", color: "#4D4943", letterSpacing: 1 },
  projectTitle: { fontSize: 23, lineHeight: 27, fontWeight: "900", color: "#1F1F1D", marginTop: 24 },
  projectLocation: { color: "#6F6961", marginTop: 7, lineHeight: 20 },
  projectDivider: { height: 1, backgroundColor: "#E7E2DA", marginVertical: 18 },
  projectMetaRow: { flexDirection: "row", justifyContent: "space-between", gap: 14, marginBottom: 10 },
  metaLabel: { color: "#918A80", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  metaValue: { color: "#1F1F1D", fontSize: 12, fontWeight: "800", flex: 1, textAlign: "right" },
  projectCardFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" as any, paddingTop: 16 },
  projectDate: { color: "#918A80", fontSize: 11 },
  openText: { color: "#EF4A3C", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  inlineLoading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  detailHero: { backgroundColor: "#1F1F1D", minHeight: 220, padding: 24, justifyContent: "flex-end", borderBottomRightRadius: 34 },
  detailHeroDesktop: { minHeight: 300, padding: 38 },
  detailHeroTitle: { color: "#FFF", fontSize: 32, lineHeight: 35, fontWeight: "900", marginTop: 10, maxWidth: 800 },
  detailHeroText: { color: "#C9C4BC", marginTop: 12, fontSize: 15 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  detailItem: { width: "48.5%", minWidth: 150, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 16, minHeight: 92 },
  detailLabel: { color: "#918A80", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  detailValue: { color: "#1F1F1D", fontSize: 15, fontWeight: "800", marginTop: 9, lineHeight: 20 },
  projectModuleCard: { width: "48.5%", minHeight: 110, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 16, position: "relative" },
  projectModuleTitle: { fontSize: 16, fontWeight: "900", color: "#1F1F1D", paddingRight: 26 },
});