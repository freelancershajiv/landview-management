import type { Metadata } from "next";
import PublicHeader from "@/components/public-header";
import PublicTeamV2 from "@/components/public-team-v2";
import { getPublicTeamForSeo, normalizePublicTeamImageUrl } from "@/lib/public-team-server";
import { business, jsonLd, siteUrl } from "@/lib/site-info";
import "./team-v2.css";

const POSITION_PREFIX = "__POSITION__:";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Our Architecture & Engineering Team | LAND VIEW",
  description: "Meet the LAND VIEW Engineers & Architects team in Feni, Bangladesh, including architecture, structural engineering, electrical engineering, project management and site supervision professionals.",
  alternates: { canonical: "/team" },
  openGraph: {
    title: "LAND VIEW Architecture & Engineering Team",
    description: "Meet the professionals behind LAND VIEW projects, design coordination and site delivery.",
    url: `${siteUrl}/team`,
    siteName: business.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LAND VIEW Architecture & Engineering Team",
    description: "Meet the professionals behind LAND VIEW projects, design coordination and site delivery.",
  },
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function publicPosition(bio?: string) {
  for (const line of text(bio).split(/\r?\n/)) {
    const value = line.trim();
    if (value.startsWith(POSITION_PREFIX)) return value.slice(POSITION_PREFIX.length).trim();
  }
  return "";
}

export default async function TeamPage() {
  const team = await getPublicTeamForSeo();
  const people = team.map((member) => {
    const position = text(member.position || publicPosition(member.bio) || member.designation || member.title || member.department);
    const image = normalizePublicTeamImageUrl(member.photoUrl);
    return {
      "@type": "Person",
      name: text(member.name) || undefined,
      jobTitle: position || undefined,
      image: image || undefined,
      worksFor: { "@id": `${siteUrl}/#organization` },
      sameAs: member.linkedInUrl ? [member.linkedInUrl] : undefined,
    };
  }).filter((person) => person.name);

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${business.name} team`,
    url: `${siteUrl}/team`,
    itemListElement: people.map((person, index) => ({ "@type": "ListItem", position: index + 1, item: person })),
  };

  return <main className="team-v2 public-site">
    {people.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} /> : null}
    <PublicHeader />
    <section className="tv2-hero"><div className="tv2-container tv2-hero-grid">
      <div><span className="tv2-kicker">LAND VIEW TEAM · FENI, BANGLADESH</span><h1>Design, engineering and delivery—working as one team.</h1></div>
      <p>Meet the publicly listed LAND VIEW professionals behind architectural planning, structural engineering, building services, project coordination and site supervision. Roles, qualifications and specialities shown here come directly from LAND VIEW’s maintained team records.</p>
    </div></section>
    {team.length ? <PublicTeamV2 members={team} /> : <section className="tv2-directory"><div className="tv2-container"><div className="tv2-empty">No team members are currently enabled for public display.</div></div></section>}
  </main>;
}
