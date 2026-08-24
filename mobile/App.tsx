import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.loginWrap}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>LV</Text></View>
        <Text style={styles.brand}>LAND VIEW</Text>
        <Text style={styles.brandSub}>ENGINEERS & ARCHITECTS</Text>
        <Text style={styles.loginTitle}>Management App</Text>
        <Text style={styles.loginText}>Sign in with your LAND VIEW account.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>USER ID</Text>
          <TextInput
            value={userId}
            onChangeText={setUserId}
            autoCapitalize="none"
            placeholder="EMP-0001 / Admin ID"
            placeholderTextColor="#9A948B"
            style={styles.input}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••••"
            placeholderTextColor="#9A948B"
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>SIGN IN</Text>}
          </Pressable>
        </View>

        <Text style={styles.footerText}>LAND VIEW Engineers & Architects</Text>
      </View>
    </SafeAreaView>
  );
}

function DashboardScreen({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const cards = useMemo(() => cardsForRole(user.role), [user.role]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.dashboard}>
        <View style={styles.dashboardHeader}>
          <View>
            <Text style={styles.eyebrow}>LAND VIEW</Text>
            <Text style={styles.welcome}>Welcome{user.name ? `, ${user.name}` : ""}</Text>
            <Text style={styles.role}>{String(user.role || "User").toUpperCase()}</Text>
          </View>
          <Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>LOG OUT</Text></Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>MANAGEMENT SYSTEM</Text>
          <Text style={styles.heroTitle}>Your LAND VIEW workspace, now on mobile.</Text>
          <Text style={styles.heroText}>Projects, documents, site supervision and accounts in one place.</Text>
        </View>

        <Text style={styles.sectionTitle}>Quick access</Text>
        <View style={styles.cardGrid}>
          {cards.map((card, index) => (
            <Pressable
              key={card.key}
              style={({ pressed }) => [styles.menuCard, pressed && styles.menuCardPressed]}
              onPress={() => Alert.alert(card.title, "This module is ready for the next development step.")}
            >
              <Text style={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</Text>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              <Text style={styles.cardArrow}>→</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_STORAGE_KEY)
      .then((saved) => {
        if (saved) setUser(JSON.parse(saved));
      })
      .finally(() => setBooting(false));
  }, []);

  async function logout() {
    try {
      await apiRequest("POST", "logout");
    } catch {}
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
  }

  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={styles.boot}><ActivityIndicator size="large" color="#EF4A3C" /></View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {user ? <DashboardScreen user={user} onLogout={logout} /> : <LoginScreen onLogin={setUser} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F1EB" },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1EB" },
  loginWrap: { flex: 1, paddingHorizontal: 28, justifyContent: "center", backgroundColor: "#F4F1EB" },
  brandMark: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: "#EF4A3C", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  brandMarkText: { color: "#EF4A3C", fontWeight: "900", fontSize: 20 },
  brand: { fontSize: 34, fontWeight: "900", letterSpacing: -1, color: "#1F1F1D" },
  brandSub: { fontSize: 12, fontWeight: "800", letterSpacing: 2.2, color: "#EF4A3C", marginTop: 4 },
  loginTitle: { fontSize: 28, fontWeight: "800", color: "#1F1F1D", marginTop: 42 },
  loginText: { color: "#6B665F", marginTop: 8, marginBottom: 28, fontSize: 15 },
  form: { gap: 10 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, color: "#5C5750", marginTop: 8 },
  input: { height: 54, borderWidth: 1, borderColor: "#D6D0C7", backgroundColor: "#FFF", paddingHorizontal: 16, fontSize: 16, color: "#1F1F1D" },
  error: { color: "#B42318", marginTop: 6, fontWeight: "600" },
  primaryButton: { height: 56, backgroundColor: "#1F1F1D", alignItems: "center", justifyContent: "center", marginTop: 14 },
  primaryButtonText: { color: "#FFF", fontWeight: "900", letterSpacing: 1.5 },
  pressed: { opacity: 0.82 },
  footerText: { textAlign: "center", color: "#918A80", marginTop: 34, fontSize: 12 },
  dashboard: { padding: 22, paddingBottom: 42 },
  dashboardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  eyebrow: { color: "#EF4A3C", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  welcome: { color: "#1F1F1D", fontSize: 25, fontWeight: "900", marginTop: 6, maxWidth: 250 },
  role: { color: "#777168", fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 6 },
  logoutButton: { borderWidth: 1, borderColor: "#CFC9BF", paddingVertical: 9, paddingHorizontal: 12 },
  logoutText: { fontSize: 10, fontWeight: "900", color: "#1F1F1D", letterSpacing: 1 },
  heroCard: { backgroundColor: "#1F1F1D", padding: 24, minHeight: 210, justifyContent: "flex-end", borderBottomRightRadius: 34 },
  heroKicker: { color: "#EF4A3C", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  heroTitle: { color: "#FFF", fontSize: 29, lineHeight: 32, fontWeight: "900", marginTop: 10 },
  heroText: { color: "#CBC7C1", lineHeight: 20, marginTop: 12, maxWidth: 310 },
  sectionTitle: { fontSize: 20, fontWeight: "900", color: "#1F1F1D", marginTop: 30, marginBottom: 14 },
  cardGrid: { gap: 12 },
  menuCard: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DDD7CE", padding: 20, minHeight: 150, position: "relative" },
  menuCardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  cardNumber: { color: "#EF4A3C", fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },
  cardTitle: { fontSize: 22, fontWeight: "900", color: "#1F1F1D", marginTop: 20 },
  cardSubtitle: { color: "#6F6961", marginTop: 6, paddingRight: 40 },
  cardArrow: { position: "absolute", right: 18, bottom: 16, color: "#EF4A3C", fontSize: 24, fontWeight: "700" },
});
