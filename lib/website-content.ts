export type WebsiteSectionKey = "stats" | "services" | "featuredProjects" | "map" | "process" | "whyUs" | "clientPortal" | "testimonials" | "team" | "faq" | "contact";
export type WebsiteStatSource = "projects" | "active" | "mapped" | "districts" | "custom";

export type WebsiteContentSettings = {
  general: {
    businessName: string;
    alternateName: string;
    email: string;
    engineeringPhone: string;
    architecturePhone: string;
    whatsappPhone: string;
    officeAddress: string;
    mapsUrl: string;
  };
  homepage: {
    eyebrow: string;
    titleLine1: string;
    titleAccent: string;
    intro: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    sections: Record<WebsiteSectionKey, boolean>;
  };
  stats: Array<{ label: string; source: WebsiteStatSource; value?: string; suffix?: string; published: boolean }>;
  process: Array<{ number: string; title: string; description: string; published: boolean; order: number }>;
  faq: Array<{ question: string; answer: string; published: boolean; order: number }>;
  footer: { blurb: string; copyright: string };
  social: { facebook: string; instagram: string; linkedin: string; youtube: string };
};

export const defaultWebsiteContent: WebsiteContentSettings = {
  general: {
    businessName: "LAND VIEW Engineers & Architects",
    alternateName: "LAND VIEW",
    email: "landviewcivil@gmail.com",
    engineeringPhone: "+8801408080400",
    architecturePhone: "+8801902500400",
    whatsappPhone: "8801902500400",
    officeAddress: "F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900, Bangladesh",
    mapsUrl: "https://maps.app.goo.gl/oCLmqzJFdiDbngu36",
  },
  homepage: {
    eyebrow: "LAND VIEW ENGINEERS & ARCHITECTS",
    titleLine1: "Design. Engineering.",
    titleAccent: "Approval. Supervision.",
    intro: "Complete building consultancy from concept to construction. LAND VIEW coordinates architecture, structural engineering, technical design, approval support and site supervision for projects in Feni and across Bangladesh.",
    primaryCtaLabel: "Start Your Project",
    primaryCtaHref: "#contact",
    secondaryCtaLabel: "Explore Projects",
    secondaryCtaHref: "/projects",
    sections: {
      stats: true, services: true, featuredProjects: true, map: true, process: true,
      whyUs: true, clientPortal: true, testimonials: true, team: true, faq: true, contact: true,
    },
  },
  stats: [
    { label: "Public Projects", source: "projects", suffix: "+", published: true },
    { label: "Active Project Stages", source: "active", suffix: "+", published: true },
    { label: "Mapped Projects", source: "mapped", suffix: "+", published: true },
    { label: "Districts Represented", source: "districts", suffix: "+", published: true },
  ],
  process: [
    { number: "01", title: "Consultation", description: "Understand the land, building requirements, priorities, budget direction and expected service scope.", published: true, order: 1 },
    { number: "02", title: "Site Information", description: "Review survey, site conditions and the technical information needed before coordinated design begins.", published: true, order: 2 },
    { number: "03", title: "Architectural Design", description: "Develop planning, circulation, elevations and a practical architectural direction for the project.", published: true, order: 3 },
    { number: "04", title: "Engineering", description: "Coordinate structural and building-service design with the approved architectural solution.", published: true, order: 4 },
    { number: "05", title: "Approval & Documents", description: "Prepare the relevant drawings and technical documentation for execution and approval support.", published: true, order: 5 },
    { number: "06", title: "Construction Support", description: "Connect drawings with the site through agreed supervision, observations and project coordination.", published: true, order: 6 },
  ],
  faq: [
    { question: "What services can LAND VIEW provide for a new building?", answer: "The public service scope includes architectural design, structural design, exterior and interior 3D visualization, electrical and plumbing design, estimate and costing, plan approval support, digital survey, soil-test coordination and site supervision. The final scope depends on the project.", published: true, order: 1 },
    { question: "Can LAND VIEW coordinate architecture and structural design together?", answer: "Yes. The consultancy is structured around coordinated architectural and engineering work so major technical decisions can be considered together rather than as isolated tasks.", published: true, order: 2 },
    { question: "Do you provide building plan approval support?", answer: "LAND VIEW can prepare and coordinate the relevant drawing and technical documentation for the applicable approval process. Exact requirements depend on the authority and the project location.", published: true, order: 3 },
    { question: "Can I see LAND VIEW projects before contacting the office?", answer: "Yes. The public Projects section shows selected work, and the Project Map lets you explore mapped public projects by location and project information.", published: true, order: 4 },
    { question: "What can an existing client access online?", answer: "The LAND VIEW client portal is designed to provide project-related information and records using the client's project credentials. Available information depends on the project and its current workflow.", published: true, order: 5 },
    { question: "How do I start a project with LAND VIEW?", answer: "Start with a consultation. Share the project location, land or site information, intended building use and the services you need. The team can then help define the appropriate scope.", published: true, order: 6 },
  ],
  footer: { blurb: "Designing Better. Building Safer.", copyright: "© 2026 LAND VIEW" },
  social: { facebook: "", instagram: "", linkedin: "", youtube: "" },
};

function str(value: unknown, fallback: string, max = 1800) {
  const out = String(value ?? "").trim().slice(0, max);
  return out || fallback;
}
function bool(value: unknown, fallback: boolean) { return typeof value === "boolean" ? value : fallback; }
function number(value: unknown, fallback: number) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.trunc(n))) : fallback; }

export function normalizeWebsiteContent(input: unknown): WebsiteContentSettings {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const g = raw.general && typeof raw.general === "object" ? raw.general as Record<string, unknown> : {};
  const h = raw.homepage && typeof raw.homepage === "object" ? raw.homepage as Record<string, unknown> : {};
  const hs = h.sections && typeof h.sections === "object" ? h.sections as Record<string, unknown> : {};
  const footer = raw.footer && typeof raw.footer === "object" ? raw.footer as Record<string, unknown> : {};
  const social = raw.social && typeof raw.social === "object" ? raw.social as Record<string, unknown> : {};
  const d = defaultWebsiteContent;
  const sections = Object.fromEntries(Object.entries(d.homepage.sections).map(([key, value]) => [key, bool(hs[key], value)])) as Record<WebsiteSectionKey, boolean>;
  const statsRaw = Array.isArray(raw.stats) ? raw.stats : d.stats;
  const processRaw = Array.isArray(raw.process) ? raw.process : d.process;
  const faqRaw = Array.isArray(raw.faq) ? raw.faq : d.faq;
  return {
    general: {
      businessName: str(g.businessName, d.general.businessName, 160), alternateName: str(g.alternateName, d.general.alternateName, 80),
      email: str(g.email, d.general.email, 180), engineeringPhone: str(g.engineeringPhone, d.general.engineeringPhone, 40),
      architecturePhone: str(g.architecturePhone, d.general.architecturePhone, 40), whatsappPhone: str(g.whatsappPhone, d.general.whatsappPhone, 40).replace(/[^0-9]/g, "") || d.general.whatsappPhone,
      officeAddress: str(g.officeAddress, d.general.officeAddress, 400), mapsUrl: str(g.mapsUrl, d.general.mapsUrl, 500),
    },
    homepage: {
      eyebrow: str(h.eyebrow, d.homepage.eyebrow, 120), titleLine1: str(h.titleLine1, d.homepage.titleLine1, 120), titleAccent: str(h.titleAccent, d.homepage.titleAccent, 120),
      intro: str(h.intro, d.homepage.intro, 700), primaryCtaLabel: str(h.primaryCtaLabel, d.homepage.primaryCtaLabel, 80), primaryCtaHref: str(h.primaryCtaHref, d.homepage.primaryCtaHref, 300),
      secondaryCtaLabel: str(h.secondaryCtaLabel, d.homepage.secondaryCtaLabel, 80), secondaryCtaHref: str(h.secondaryCtaHref, d.homepage.secondaryCtaHref, 300), sections,
    },
    stats: statsRaw.slice(0, 8).map((item, index) => { const x = item && typeof item === "object" ? item as Record<string, unknown> : {}; const fallback = d.stats[index] || { label: "Statistic", source: "custom" as const, published: true }; const source = ["projects","active","mapped","districts","custom"].includes(String(x.source)) ? String(x.source) as WebsiteStatSource : fallback.source; return { label: str(x.label, fallback.label, 80), source, value: source === "custom" ? str(x.value, String(fallback.value || "0"), 30) : "", suffix: String(x.suffix ?? fallback.suffix ?? "").slice(0, 6), published: bool(x.published, fallback.published) }; }),
    process: processRaw.slice(0, 12).map((item, index) => { const x = item && typeof item === "object" ? item as Record<string, unknown> : {}; const fallback = d.process[index] || { number: String(index + 1).padStart(2,"0"), title: "Step", description: "", published: true, order: index + 1 }; return { number: str(x.number, fallback.number, 12), title: str(x.title, fallback.title, 120), description: str(x.description, fallback.description, 600), published: bool(x.published, fallback.published), order: number(x.order, fallback.order) }; }),
    faq: faqRaw.slice(0, 20).map((item, index) => { const x = item && typeof item === "object" ? item as Record<string, unknown> : {}; const fallback = d.faq[index] || { question: "Question", answer: "Answer", published: true, order: index + 1 }; return { question: str(x.question, fallback.question, 260), answer: str(x.answer, fallback.answer, 1200), published: bool(x.published, fallback.published), order: number(x.order, fallback.order) }; }),
    footer: { blurb: str(footer.blurb, d.footer.blurb, 220), copyright: str(footer.copyright, d.footer.copyright, 120) },
    social: { facebook: String(social.facebook ?? "").trim().slice(0,500), instagram: String(social.instagram ?? "").trim().slice(0,500), linkedin: String(social.linkedin ?? "").trim().slice(0,500), youtube: String(social.youtube ?? "").trim().slice(0,500) },
  };
}
