import Link from "next/link";
import PublicHeader from "@/components/public-header";
import {
  getPublicTeamForSeo,
  normalizePublicTeamImageUrl,
  type PublicTeamMember,
} from "@/lib/public-team-server";
import { business, jsonLd, siteUrl } from "@/lib/site-info";

const PUBLIC_POSITION_PREFIX = "__POSITION__:";

const TEAM_GROUPS = [
  { key: "structural", title: "Structural Engineers", description: "Structural engineering, civil engineering and building-structure design.", matches: ["structural", "structure", "civil engineering", "civil engineer"] },
  { key: "architects", title: "Architects", description: "Architecture, planning, visualization and architectural design.", matches: ["architecture", "architectural", "architect"] },
  { key: "electrical", title: "Electrical Engineers", description: "Electrical design, power, lighting and coordinated building services.", matches: ["electrical", "electric"] },
  { key: "management", title: "Project Management & Supervision", description: "Project coordination, site supervision, quality control and delivery support.", matches: ["project management", "supervision", "site supervision", "project coordination"] },
] as const;

function isDegreeLine(value: string) {
  return /^(ph\.?d|doctorate|m\.?\s*sc|m\.?\s*s\.?c|b\.?\s*sc|b\.?\s*s\.?c|m\.?\s*arch|b\.?\s*arch|m\.?\s*eng|b\.?\s*eng|mba|bba|diploma|associate degree|master|bachelor)/i.test(value.trim());
}

function splitCredentialText(value?: string) {
  return String(value || "")
    .split(/\r?\n|\s*[•|]\s*|\s+-\s+(?=(?:Ph\.?D|Doctorate|M\.?\s*Sc|M\.?\s*S\.?c|B\.?\s*Sc|B\.?\s*S\.?c|M\.?\s*Arch|B\.?\s*Arch|M\.?\s*Eng|B\.?\s*Eng|MBA|BBA|Diploma|Associate Degree|Master|Bachelor)\b)/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitBio(value?: string) {
  let position = "";
  const contentLines: string[] = [];
  String(value || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(PUBLIC_POSITION_PREFIX)) position = trimmed.slice(PUBLIC_POSITION_PREFIX.length).trim();
    else if (trimmed) contentLines.push(trimmed);
  });

  const degrees: string[] = [];
  const specialities: string[] = [];
  splitCredentialText(contentLines.join("\n")).forEach((item) => {
    if (isDegreeLine(item)) degrees.push(item);
    else specialities.push(item);
  });
  return { position, degrees, specialities };
}

function teamSearchText(member: PublicTeamMember) {
  return [member.department, member.position, member.designation, member.title, member.speciality, member.specialities]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function TeamCard({ member, index }: { member: PublicTeamMember; index: number }) {
  const parsedBio = splitBio(member.bio);
  const designation = member.designation || member.title || "";
  const position = member.position || parsedBio.position || "";
  const department = member.department || "";
  const explicitDegrees = splitCredentialText(member.degrees || member.degree || "");
  const degrees = explicitDegrees.length ? explicitDegrees : parsedBio.degrees;
  const specialityValue = member.specialities || member.speciality || "";
  const specialities = specialityValue ? splitCredentialText(specialityValue) : parsedBio.specialities;
  const initials = String(member.name || "LV").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  const photo = normalizePublicTeamImageUrl(member.photoUrl);

  return (
    <article className="team-page-card public-team-card">
      <div className="public-team-photo">
        {photo ? <img src={photo} alt={`${member.name || "LAND VIEW team member"} — ${position || department || "LAND VIEW"}`} /> : <span>{initials}</span>}
      </div>
      <div className="public-team-copy">
        <span className="public-team-index">{String(index + 1).padStart(2, "0")}</span>
        <h3>{designation ? <><span className="public-team-designation">{designation}</span>{" "}</> : null}<span className="public-team-name">{member.name}</span></h3>
        {position ? <div className="public-team-info-block"><span className="public-team-label">POSITION</span><strong>{position}</strong></div> : null}
        {department ? <div className="public-team-info-block"><span className="public-team-label">DEPARTMENT</span><strong>{department}</strong></div> : null}
        {degrees.length || specialities.length ? <div className="public-team-info-block public-team-credentials">
          <span className="public-team-label">DEGREES &amp; SPECIALITIES</span>
          {degrees.length ? <div className="public-team-degrees">{degrees.map((item, i) => <small className="public-team-degree" key={`${item}-${i}`}>{item}</small>)}</div> : null}
          {specialities.length ? <div className="public-team-specialities">{specialities.map((item, i) => <span key={`${item}-${i}`}>{item}</span>)}</div> : null}
        </div> : null}
        {member.linkedInUrl ? <a className="team-linkedin" href={member.linkedInUrl} rel="noopener noreferrer">Professional profile ↗</a> : null}
      </div>
    </article>
  );
}

const css = `
  .team-page{min-height:100vh;background:#07101a;color:#fff;--gold:#ef4a50;--gold-light:#ef4a50;--panel:#101a24;--line:#2b3843}.team-page .public-container{width:min(100% - 44px,1320px);margin:0 auto}.team-hero{padding:86px 0 62px;background:radial-gradient(circle at 76% 20%,rgba(214,31,38,.13),transparent 30%),linear-gradient(135deg,#07101a,#0d1823)}.team-hero span{display:block;margin-bottom:14px;color:var(--gold-light);font-size:12px;font-weight:900;letter-spacing:.2em}.team-hero h1{max-width:920px;margin:0;font:500 clamp(44px,6vw,76px)/.98 Georgia,"Times New Roman",serif}.team-hero p{max-width:800px;margin:22px 0 0;color:#aab4bc;font-size:14px;line-height:1.8}.team-page-body{padding:72px 0 96px}.team-groups{display:grid;gap:66px}.team-group{display:grid;gap:24px}.team-group-head{display:flex;align-items:end;justify-content:space-between;gap:32px;padding-bottom:17px;border-bottom:1px solid var(--line)}.team-group-head span{display:block;margin-bottom:7px;color:var(--gold-light);font-size:12px;font-weight:900;letter-spacing:.18em}.team-group-head h2{margin:0;font:500 clamp(28px,3vw,38px)/1.05 Georgia,"Times New Roman",serif}.team-group-head p{max-width:430px;margin:0;color:#8d99a3;font-size:12px;line-height:1.7;text-align:right}.team-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:20px}.team-page-card{flex:0 1 calc((100% - 60px)/4);max-width:calc((100% - 60px)/4);width:100%;border:1px solid var(--line)!important;background:var(--panel)!important;color:#fff!important;box-shadow:0 16px 38px rgba(0,0,0,.25)!important}.team-page-card .public-team-copy h3{white-space:normal;font-size:clamp(15px,1.25vw,19px)!important}.team-page-card .public-team-designation,.team-page-card .public-team-label{color:var(--gold-light)!important}.team-page-card .public-team-name,.team-page-card .public-team-info-block strong,.team-page-card .public-team-degree{color:#fff!important}.team-page-card .public-team-label{font-size:12px!important;letter-spacing:.12em!important}.team-page-card .public-team-info-block strong{font-size:14px!important;line-height:1.5!important}.team-page-card .public-team-degree{display:block;font-size:13px!important;line-height:1.55!important}.team-page-card .public-team-specialities,.team-page-card .public-team-specialities span{display:block;color:#b2bcc5!important;font-size:13px!important;line-height:1.55!important}.team-page-card .public-team-info-block{border-color:var(--line)!important}.team-page-card .public-team-photo{border-color:var(--gold)!important}.team-page-card .public-team-photo span{background:#07101a!important}.team-linkedin{display:inline-block;margin-top:14px;color:#ef4a50;font-size:12px;font-weight:800}.team-empty{padding:28px;border:1px dashed #34414c;color:#7e8a94;text-align:center}.team-back{display:flex;justify-content:center;margin-top:58px;gap:12px;flex-wrap:wrap}.team-back a{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:0 24px;border:1px solid var(--gold);border-radius:7px;background:linear-gradient(180deg,#d61f26,#ad171d);color:#fff;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}@media(max-width:1100px){.team-page-card{flex-basis:calc((100% - 20px)/2);max-width:calc((100% - 20px)/2)}}@media(max-width:760px){.team-group-head{align-items:flex-start;flex-direction:column;gap:10px}.team-group-head p{text-align:left}.team-hero{padding:62px 0 46px}}@media(max-width:620px){.team-page .public-container{width:min(100% - 28px,1320px)}.team-page-card{flex-basis:100%;max-width:100%}.team-page-body{padding:52px 0 72px}}
`;

export default async function TeamPage() {
  const team = await getPublicTeamForSeo();
  const grouped = TEAM_GROUPS.map((group) => ({ ...group, members: team.filter((member) => group.matches.some((match) => teamSearchText(member).includes(match))) }));
  const categorized = new Set(grouped.flatMap((group) => group.members));
  const others = team.filter((member) => !categorized.has(member));

  const peopleSchema = team.map((member) => {
    const parsedBio = splitBio(member.bio);
    const position = member.position || parsedBio.position || member.department || undefined;
    const image = normalizePublicTeamImageUrl(member.photoUrl);
    return {
      "@type": "Person",
      name: member.name,
      jobTitle: position,
      image: image || undefined,
      worksFor: { "@id": `${siteUrl}/#organization` },
      sameAs: member.linkedInUrl ? [member.linkedInUrl] : undefined,
    };
  }).filter((person) => person.name);

  const teamSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${business.name} team`,
    url: `${siteUrl}/team`,
    itemListElement: peopleSchema.map((person, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: person,
    })),
  };

  return <main className="team-page">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    {peopleSchema.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(teamSchema) }} /> : null}
    <PublicHeader />
    <section className="team-hero"><div className="public-container"><span>OUR PEOPLE · FENI, BANGLADESH</span><h1>Engineering and design expertise, working as one team.</h1><p>Meet the LAND VIEW professionals responsible for structural engineering, architecture, project management and site supervision. Team information below is rendered directly in the page HTML so clients and search engines can evaluate the people behind the consultancy.</p></div></section>
    <section className="team-page-body"><div className="public-container">
      {team.length ? <div className="team-groups">
        {grouped.map((group) => <section className="team-group" key={group.key}><div className="team-group-head"><div><span>LAND VIEW TEAM</span><h2>{group.title}</h2></div><p>{group.description}</p></div>{group.members.length ? <div className="team-grid">{group.members.map((member, index) => <TeamCard key={`${group.key}-${member.name || index}`} member={member} index={index} />)}</div> : <div className="team-empty">No public team member is currently listed in this department.</div>}</section>)}
        {others.length ? <section className="team-group"><div className="team-group-head"><div><span>LAND VIEW TEAM</span><h2>Other Team Members</h2></div><p>Additional professionals supporting LAND VIEW projects and delivery.</p></div><div className="team-grid">{others.map((member, index) => <TeamCard key={`other-${member.name || index}`} member={member} index={index} />)}</div></section> : null}
      </div> : <div className="team-empty">No team members are available for public display right now.</div>}
      <div className="team-back"><Link href="/services">Our Services</Link><Link href="/projects">View Projects</Link></div>
    </div></section>
  </main>;
}
