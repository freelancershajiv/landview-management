export type ResolvedGoogleMapsLocation = {
  latitude: number;
  longitude: number;
  sourceUrl?: string;
  method: "direct" | "expanded-link";
};

const GOOGLE_HOSTS = new Set(["goo.gl", "maps.app.goo.gl", "maps.google.com"]);

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function isGoogleHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const regionalGoogle = /(^|\.)google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/i.test(host);
  return GOOGLE_HOSTS.has(host) || host === "google.com" || host.endsWith(".google.com") || host.endsWith(".goo.gl") || regionalGoogle;
}

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function resolved(latitude: number, longitude: number, method: ResolvedGoogleMapsLocation["method"], sourceUrl?: string): ResolvedGoogleMapsLocation | null {
  if (!validCoordinate(latitude, longitude)) return null;
  return {
    latitude: Number(latitude.toFixed(8)),
    longitude: Number(longitude.toFixed(8)),
    method,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function pair(value: string, pattern: RegExp, method: ResolvedGoogleMapsLocation["method"], sourceUrl?: string) {
  const match = value.match(pattern);
  if (!match) return null;
  return resolved(Number(match[1]), Number(match[2]), method, sourceUrl);
}

export function looksLikeGoogleMapsLocation(value: unknown) {
  const raw = text(value, 4000);
  if (!raw) return false;
  try {
    return isGoogleHost(new URL(raw).hostname);
  } catch {
    return /(?:google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(raw);
  }
}

export function parseGoogleMapsCoordinates(value: unknown, method: ResolvedGoogleMapsLocation["method"] = "direct", sourceUrl?: string) {
  const raw = text(value, 12000);
  if (!raw) return null;
  const candidates = [raw];
  try { candidates.push(decodeURIComponent(raw)); } catch {}

  for (const candidate of candidates) {
    const patterns = [
      /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)(?:[,/]|$)/,
      /[?&](?:q|query|ll|center)=(-?\d{1,2}(?:\.\d+)?)(?:%2C|,|%2c)\s*(-?\d{1,3}(?:\.\d+)?)(?:&|$)/i,
      /!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/i,
      /(?:^|[^\d.-])(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})(?:[^\d.]|$)/,
    ];
    for (const pattern of patterns) {
      const found = pair(candidate, pattern, method, sourceUrl);
      if (found) return found;
    }

    const lngLat = candidate.match(/!2d(-?\d{1,3}(?:\.\d+)?).*?!3d(-?\d{1,2}(?:\.\d+)?)/i);
    if (lngLat) {
      const found = resolved(Number(lngLat[2]), Number(lngLat[1]), method, sourceUrl);
      if (found) return found;
    }
  }
  return null;
}

function safeGoogleUrl(value: string, base?: string) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol !== "https:" || !isGoogleHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
}

function coordinatesFromHtml(html: string, sourceUrl: string) {
  // Only trust canonical/location URL metadata. Generic coordinates elsewhere in
  // Google's HTML can represent a server/default viewport rather than the shared pin.
  const candidates: string[] = [];
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/gi,
    /<meta[^>]+(?:property|name)=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:url["'][^>]*>/gi,
    /<meta[^>]+itemprop=["']url["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    for (let match = pattern.exec(html); match && candidates.length < 20; match = pattern.exec(html)) {
      candidates.push(decodeHtmlUrl(match[1]));
    }
  }

  // Google sometimes embeds the expanded Maps URL inside script data instead of
  // exposing a canonical tag. Restrict this fallback to explicit /maps/ URLs.
  const embedded = /https:\/\/(?:www\.)?google\.[^"'\\\s<]+\/maps\/[^"'\\\s<]+/gi;
  for (let match = embedded.exec(html); match && candidates.length < 40; match = embedded.exec(html)) {
    candidates.push(decodeHtmlUrl(match[0]));
  }

  for (const candidate of candidates) {
    const found = parseGoogleMapsCoordinates(candidate, "expanded-link", sourceUrl);
    if (found) return found;
  }
  return null;
}

const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
};

export async function resolveGoogleMapsLocation(value: unknown): Promise<ResolvedGoogleMapsLocation | null> {
  const raw = text(value, 4000);
  if (!raw) return null;

  const direct = parseGoogleMapsCoordinates(raw, "direct");
  if (direct) return direct;

  const first = safeGoogleUrl(raw);
  if (!first) return null;

  // First let the HTTP client follow the entire short-link chain. For
  // maps.app.goo.gl this usually produces the full /maps/.../@lat,lng URL and is
  // considerably more reliable than interpreting intermediate Google pages.
  try {
    const response = await fetch(first, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    const finalUrl = response.url || first.toString();
    const fromFinalUrl = parseGoogleMapsCoordinates(finalUrl, "expanded-link", finalUrl);
    if (fromFinalUrl) return fromFinalUrl;

    if (response.ok) {
      const html = (await response.text()).slice(0, 1_000_000);
      const fromHtml = coordinatesFromHtml(html, finalUrl);
      if (fromHtml) return fromHtml;
    }
  } catch {}

  // Fallback for runtimes where automatic redirects are blocked or rewritten.
  let current = first;
  for (let redirect = 0; redirect < 8; redirect += 1) {
    const parsed = parseGoogleMapsCoordinates(current.toString(), "expanded-link", current.toString());
    if (parsed) return parsed;

    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }

    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      const next = safeGoogleUrl(location, current.toString());
      if (!next) return null;
      current = next;
      continue;
    }

    const finalUrl = response.url || current.toString();
    const fromFinalUrl = parseGoogleMapsCoordinates(finalUrl, "expanded-link", finalUrl);
    if (fromFinalUrl) return fromFinalUrl;

    if (response.ok) {
      const html = (await response.text()).slice(0, 1_000_000);
      const fromHtml = coordinatesFromHtml(html, finalUrl);
      if (fromHtml) return fromHtml;
    }
    break;
  }
  return null;
}
