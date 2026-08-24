import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Row = Record<string, any>;
const API_URL = "https://app.landview.com.bd/api/landview";

async function getSiteVisits(projectId?: string) {
  const params = new URLSearchParams({ action: "getSiteVisits" });
  if (projectId) params.set("projectId", projectId);
  const response = await fetch(`${API_URL}?${params.toString()}`, { credentials: "include" });
  const json = await response.json();
  if (!response.ok || json?.success === false) throw new Error(json?.error || json?.message || "Could not load site visits.");
  return Array.isArray(json?.data) ? json.data : [];
}

function pick(row: Row, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return fallback;
}

function formatDate(value: any) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SiteVisitsScreen({ onBack, projectId }: { onBack: () => void; projectId?: string }) {
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try { setRows(await getSiteVisits(projectId)); }
    catch (e: any) { setError(e?.message || "Could not load site visits."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [projectId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(needle)) : rows;
    return [...list].reverse();
  }, [rows, query]);

  const cardWidth = Platform.OS === "web" && width >= 1080 ? "48.8%" : "100%";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          <View style={styles.header}>
            <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
            <View style={{ flex: 1 }}><Text style={styles.eyebrow}>FIELD OPERATIONS</Text><Text style={styles.title}>{projectId ? `${projectId} Site Visits` : "Site Visits"}</Text></View>
          </View>

          <View style={styles.searchBox}>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search visits, engineer, purpose..." placeholderTextColor="#918A80" style={styles.search} />
            <Text style={styles.count}>{filtered.length} RECORDS</Text>
          </View>

          {loading ? <View style={styles.state}><ActivityIndicator color="#EF4A3C"/><Text style={styles.muted}>Loading site visits...</Text></View> :
          error ? <View style={styles.state}><Text style={styles.error}>{error}</Text><Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable></View> :
          !filtered.length ? <View style={styles.state}><Text style={styles.stateTitle}>No site visits</Text><Text style={styles.muted}>No site supervision records are available in this view.</Text></View> :
          <View style={styles.grid}>{filtered.map((row, index) => {
            const visitId = pick(row, ["Visit_ID", "Visit ID"], `Visit ${filtered.length - index}`);
            const purpose = pick(row, ["Purpose", "Visit_Purpose", "Visit Purpose"], "Site visit");
            const engineer = pick(row, ["Engineer", "Employee_Name", "Visited_By", "Visited By"], "LAND VIEW");
            const observation = pick(row, ["Observation", "Observations", "Notes"], "No observation recorded.");
            const action = pick(row, ["Action_Required", "Action Required"]);
            const status = pick(row, ["Status"], "Completed");
            return <View key={`${visitId}-${index}`} style={[styles.card, { width: cardWidth as any }]}>
              <View style={styles.cardTop}><Text style={styles.visitId}>{visitId}</Text><Text style={styles.status}>{status.toUpperCase()}</Text></View>
              <Text style={styles.project}>{pick(row, ["Project_ID", "Project ID"], projectId || "—")}</Text>
              <Text style={styles.purpose}>{purpose}</Text>
              <Text style={styles.date}>{formatDate(row.Visit_Date || row.Date || row.Created_At)}</Text>
              <View style={styles.divider}/>
              <Text style={styles.label}>VISITED BY</Text><Text style={styles.value}>{engineer}</Text>
              <Text style={styles.label}>OBSERVATION</Text><Text style={styles.body}>{observation}</Text>
              {action ? <View style={styles.action}><Text style={styles.actionLabel}>ACTION REQUIRED</Text><Text style={styles.actionText}>{action}</Text></View> : null}
            </View>;
          })}</View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#F4F1EB"},scroll:{flexGrow:1,paddingBottom:42},page:{width:"100%",maxWidth:1260,alignSelf:"center",padding:22},header:{flexDirection:"row",alignItems:"center",gap:14,marginBottom:24},back:{width:44,height:44,borderWidth:1,borderColor:"#CFC9BF",alignItems:"center",justifyContent:"center",backgroundColor:"#FFF"},backText:{fontSize:22,fontWeight:"800",color:"#1F1F1D"},eyebrow:{color:"#EF4A3C",fontSize:11,fontWeight:"900",letterSpacing:2},title:{fontSize:30,fontWeight:"900",color:"#1F1F1D",marginTop:4},searchBox:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#DDD7CE",padding:12,marginBottom:18},search:{height:48,paddingHorizontal:14,backgroundColor:"#F8F6F2",fontSize:15,color:"#1F1F1D"},count:{marginTop:10,color:"#777168",fontSize:10,fontWeight:"900",letterSpacing:1.3},state:{minHeight:180,alignItems:"center",justifyContent:"center",backgroundColor:"#FFF",borderWidth:1,borderColor:"#DDD7CE",padding:28,gap:12},stateTitle:{fontSize:20,fontWeight:"900",color:"#1F1F1D"},muted:{color:"#777168",textAlign:"center"},error:{color:"#B42318",fontWeight:"700",textAlign:"center"},retry:{backgroundColor:"#1F1F1D",paddingHorizontal:18,paddingVertical:12},retryText:{color:"#FFF",fontSize:10,fontWeight:"900",letterSpacing:1.2},grid:{flexDirection:"row",flexWrap:"wrap",gap:12},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#DDD7CE",padding:20,minHeight:300},cardTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},visitId:{color:"#EF4A3C",fontSize:10,fontWeight:"900",letterSpacing:1.2},status:{color:"#5C5750",fontSize:9,fontWeight:"900",letterSpacing:1},project:{color:"#777168",fontSize:11,fontWeight:"800",marginTop:20},purpose:{fontSize:22,fontWeight:"900",color:"#1F1F1D",marginTop:6},date:{color:"#918A80",fontSize:11,marginTop:8},divider:{height:1,backgroundColor:"#E7E2DA",marginVertical:18},label:{color:"#918A80",fontSize:9,fontWeight:"900",letterSpacing:1.2,marginTop:10},value:{color:"#1F1F1D",fontSize:14,fontWeight:"800",marginTop:5},body:{color:"#5F5A53",fontSize:14,lineHeight:21,marginTop:6},action:{backgroundColor:"#F8F1EF",borderLeftWidth:3,borderLeftColor:"#EF4A3C",padding:14,marginTop:18},actionLabel:{color:"#EF4A3C",fontSize:9,fontWeight:"900",letterSpacing:1.2},actionText:{color:"#1F1F1D",lineHeight:20,marginTop:6,fontWeight:"600"}
});