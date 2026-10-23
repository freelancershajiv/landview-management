import { getVercelOidcToken } from "@vercel/oidc";

const PUBLIC_PROJECTS_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-public-projects";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, any>;

export type DatabasePublicProjectCategory = {
  name: string;
  count: number;
};

export type DatabasePublicProjectPage = {
  data: Row[];
  offset: number;
  limit: number;
  total: number;
  publishedTotal: number;
  hasMore: boolean;
  categories: DatabasePublicProjectCategory[];
  hasMappedProjects: boolean;
};

function finiteInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function getPublicProjectDatabasePage(input: {
  offset?: number;
  limit?: number;
  query?: string;
  category?: string;
} = {}): Promise<DatabasePublicProjectPage> {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

  const offset = Math.max(0, finiteInteger(input.offset, 0));
  const limit = Math.min(24, Math.max(1, finiteInteger(input.limit, 12)));
  const query = String(input.query || "").trim();
  const category = String(input.category || "").trim();

  const response = await fetch(PUBLIC_PROJECTS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidc}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ offset, limit, query, category }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success || !json?.data) {
    throw new Error(String(json?.error || `Public project data service returned HTTP ${response.status}.`));
  }

  const page = json.data as Record<string, unknown>;
  const data = Array.isArray(page.data) ? page.data as Row[] : [];
  const categories = Array.isArray(page.categories)
    ? page.categories
        .map((item: any) => ({ name: String(item?.name || "").trim(), count: Math.max(0, finiteInteger(item?.count, 0)) }))
        .filter((item: DatabasePublicProjectCategory) => item.name)
    : [];
  const total = Math.max(0, finiteInteger(page.total, data.length));
  const publishedTotal = Math.max(total, finiteInteger(page.publishedTotal, total));
  const pageOffset = Math.max(0, finiteInteger(page.offset, offset));
  const pageLimit = Math.min(24, Math.max(1, finiteInteger(page.limit, limit)));

  return {
    data,
    offset: pageOffset,
    limit: pageLimit,
    total,
    publishedTotal,
    hasMore: typeof page.hasMore === "boolean" ? page.hasMore : pageOffset + data.length < total,
    categories,
    hasMappedProjects: page.hasMappedProjects === true,
  };
}
