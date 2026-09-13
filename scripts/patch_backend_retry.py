from pathlib import Path

path = Path("app/api/landview/route.ts")
s = path.read_text(encoding="utf-8")

old = '''async function callBackend(payload: Record<string, unknown>) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(/^\\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
  }
  return { response, json };
}
'''

new = '''async function callBackend(payload: Record<string, unknown>) {
  const delays = [0, 250, 700, 1400];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "follow",
      });
      const text = await response.text();
      let json: any;

      try {
        json = JSON.parse(text);
      } catch {
        const message = /^\\s*</.test(text)
          ? "Apps Script returned HTML instead of JSON."
          : "Apps Script returned invalid JSON.";
        lastError = new Error(message);
        if (attempt < delays.length - 1) continue;
        throw lastError;
      }

      if (response.status >= 500 && attempt < delays.length - 1) {
        lastError = new Error(`Apps Script returned HTTP ${response.status}.`);
        continue;
      }

      return { response, json };
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Backend request failed."));
      if (attempt >= delays.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("Unable to reach LAND VIEW backend.");
}
'''

if 'const delays = [0, 250, 700, 1400];' not in s:
    if old not in s:
        raise SystemExit("callBackend anchor not found")
    s = s.replace(old, new, 1)

path.write_text(s, encoding="utf-8")
print("Apps Script proxy retry patch applied successfully")
