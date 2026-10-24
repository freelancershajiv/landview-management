"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicTeamMember } from "@/lib/public-team-server";

const POSITION_PREFIX = "__POSITION__:";
const LEADERSHIP_WORDS = ["founder", "director", "general manager", "manager", "head", "chief", "principal", "lead"];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhotoUrl(url?: string, size = "w900") {
  const value = text(url);
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=${size}`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${size}`;
    }
  } catch {}
  return value;
}

function isDegreeLine(value: string) {
  return /^(ph\.?d|doctorate|m\.?\s*sc|m\.?\s*s\.?c|b\.?\s*sc|b\.?\s*s\.?c|m\.?\s*arch|b\.?\s*arch|m\.?\s*eng|b\.?\s*eng|mba|bba|diploma|associate degree|master|bachelor)/i.test(value.trim());
}

function splitValues(value?: string) {
  return text(value)
    .split(/\r?\n|\s*[•|]\s*|\s+-\s+(?=(?:Ph\.?D|Doctorate|M\.?\s*Sc|M\.?\s*S\.?c|B\.?\s*Sc|B\.?\s*S\.?c|M\.?\s*Arch|B\.?\s*Arch|M\.?\s*Eng|B\.?\s*Eng|MBA|BBA|Diploma|Associate Degree|Master|Bachelor)\b)/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBio(value?: string) {
  let position = "";
  const content: string[] = [];
  text(value).split(/\r?\n/).forEach((line) => {
    const item = line.trim();
    if (!item) return;
    if (item.startsWith(POSITION_PREFIX)) position = item.slice(POSITION_PREFIX.length).trim();
    else content.push(item);
  });
  const degrees: string[] = [];
  const specialities: string[] = [];
  splitValues(content.join("\n")).forEach((item) => (isDegreeLine(item) ? degrees.push(item) : specialities.push(item)));
  return { position, degrees, specialities };
}

function memberView(member: PublicTeamMember) {
  const parsed = parseBio(member.bio);
  const position = text(member.position || parsed.position || member.designation || member.title);
  const department = text(member.department);
  const explicitDegrees = splitValues(member.degrees || member.degree);
  const degrees = explicitDegrees.length ? explicitDegrees : parsed.degrees;
  const explicitSpecialities = splitValues(member.specialities || member.speciality);
  const specialities = explicitSpecialities.length ? explicitSpecialities : parsed.specialities;
  return { position, department, degrees, specialities };
}

function departmentLabel(member: PublicTeamMember) {
  const { department, position, specialities } = memberView(member);
  const source = [department, position, ...specialities].join(" ").toLowerCase();
  if (/architect/.test(source)) return "Architecture";
  if (/structur|civil/.test(source)) return "Structural Engineering";
  if (/electrical|electric/.test(source)) return "Electrical Engineering";
  if (/project management|supervision|site|coordination/.test(source)) return "Project Delivery";
  return department || "Other";
}

function isLeadership(member: PublicTeamMember) {
  const { position } = memberView(member);
  return LEADERSHIP_WORDS.some((word) => position.toLowerCase().includes(word));
}

function MemberCard({ member, featured = false }: { member: PublicTeamMember; featured?: boolean }) {
  const { position, department, degrees, specialities } = memberView(member);
  const photo = normalizePhotoUrl(member.photoUrl, featured ? "w1400" : "w900");
  const initials = text(member.name || "LV").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <article className={`tv2-card${featured ? " tv2-card-featured" : ""}`}>
    <div className="tv2-photo-wrap">
      {photo ? <img className="tv2-photo" src={photo} alt={`${text(member.name) || "LAND VIEW team member"}${position ? ` — ${position}` : ""}`} /> : <div className="tv2-photo-fallback">{initials}</div>}
      <span className="tv2-dept-chip">{departmentLabel(member)}</span>
    </div>
    <div className="tv2-card-copy">
      <h3>{text(member.name) || "LAND VIEW Team Member"}</h3>
      {position ? <p className="tv2-position">{position}</p> : null}
      {department && department !== position ? <p className="tv2-department">{department}</p> : null}
      {degrees.length ? <div className="tv2-block"><span className="tv2-label">Qualifications</span><div className="tv2-lines">{degrees.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div> : null}
      {specialities.length ? <div className="tv2-block"><span className="tv2-label">Specialities</span><div className="tv2-tags">{specialities.slice(0, 6).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div> : null}
      <div className="tv2-card-actions">
        {member.linkedInUrl ? <a href={member.linkedInUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a> : null}
        <Link href="/projects">View Projects</Link>
      </div>
    </div>
  </article>;
}

export default function PublicTeamV2({ members }: { members: PublicTeamMember[] }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");
  const departments = useMemo(() => ["All", ...Array.from(new Set(members.map(departmentLabel).filter(Boolean))).sort((a, b) => a.localeCompare(b))], [members]);
  const leadership = useMemo(() => members.filter(isLeadership).slice(0, 4), [members]);
  const leadershipSet = useMemo(() => new Set(leadership), [leadership]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members.filter((member) => {
      const view = memberView(member);
      const dept = departmentLabel(member);
      const haystack = [member.name, view.position, view.department, ...view.degrees, ...view.specialities].map(text).join(" ").toLowerCase();
      return (department === "All" || dept === department) && (!term || haystack.includes(term));
    });
  }, [members, query, department]);
  const directory = filtered.filter((member) => !leadershipSet.has(member) || query || department !== "All");

  return <>
    <section className="tv2-summary"><div className="tv2-container tv2-summary-grid">
      <div><span className="tv2-kicker">PEOPLE BEHIND THE PROJECTS</span><h2>One coordinated consultancy team.</h2></div>
      <div className="tv2-summary-stats"><div><strong>{members.length}</strong><span>Public team members</span></div><div><strong>{Math.max(0, departments.length - 1)}</strong><span>Disciplines</span></div><div><strong>{leadership.length}</strong><span>Leadership roles</span></div></div>
    </div></section>

    {leadership.length ? <section className="tv2-section"><div className="tv2-container"><div className="tv2-section-head"><div><span className="tv2-kicker">LEADERSHIP & COORDINATION</span><h2>Project direction starts here.</h2></div><p>Publicly listed leadership and coordination roles are shown first, based on the position data maintained by LAND VIEW.</p></div><div className="tv2-featured-grid">{leadership.map((member, index) => <MemberCard key={`lead-${text(member.name)}-${index}`} member={member} featured />)}</div></div></section> : null}

    <section className="tv2-directory"><div className="tv2-container">
      <div className="tv2-section-head"><div><span className="tv2-kicker">TEAM DIRECTORY</span><h2>Find the right discipline.</h2></div><p>Search by name, role, qualification or speciality, or filter the public directory by discipline.</p></div>
      <div className="tv2-tools"><label className="tv2-search"><span>Search team</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, role, qualification or speciality…" /></label><div className="tv2-filters" role="group" aria-label="Filter team by discipline">{departments.map((item) => <button type="button" key={item} className={department === item ? "active" : ""} onClick={() => setDepartment(item)}>{item}</button>)}</div></div>
      <div className="tv2-result-line"><strong>{filtered.length}</strong> team member{filtered.length === 1 ? "" : "s"} shown</div>
      {directory.length ? <div className="tv2-grid">{directory.map((member, index) => <MemberCard key={`${text(member.name)}-${index}`} member={member} />)}</div> : filtered.length && leadership.length && !query && department === "All" ? null : <div className="tv2-empty">No public team member matches this search or discipline.</div>}
    </div></section>

    <section className="tv2-cta"><div className="tv2-container tv2-cta-inner"><div><span className="tv2-kicker">WORK WITH LAND VIEW</span><h2>Bring architecture, engineering and site coordination together.</h2><p>Explore the services our team provides, review published projects, or send your project brief directly to LAND VIEW.</p></div><div className="tv2-cta-actions"><Link href="/services">Explore Services</Link><Link href="/projects" className="secondary">View Projects</Link><Link href="/contact" className="secondary">Start an Enquiry</Link></div></div></section>
  </>;
}
