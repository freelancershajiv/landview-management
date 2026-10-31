"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicTeamMember } from "@/lib/public-team-server";

const POSITION_PREFIX = "__POSITION__:";
const DEPARTMENT_ORDER = ["Structural Engineering", "Architecture", "Project Engineering"];

const DEPARTMENT_META: Record<string, { eyebrow: string; title: string; description: string; className: string }> = {
  "Structural Engineering": {
    eyebrow: "STRUCTURE & TECHNICAL DESIGN",
    title: "Structural Engineering",
    description: "Structural analysis, RCC design, technical review and engineering coordination for safe, efficient and buildable projects.",
    className: "structural",
  },
  Architecture: {
    eyebrow: "ARCHITECTURE & DESIGN",
    title: "Architecture",
    description: "Planning, architectural design and design coordination shaped around function, context, proportion and the client brief.",
    className: "architecture",
  },
  "Project Engineering": {
    eyebrow: "SITE & PROJECT DELIVERY",
    title: "Project Engineering",
    description: "Site supervision, project coordination and field-level engineering that connect the design office with construction on site.",
    className: "project",
  },
};

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
  if (/structur/.test(source)) return "Structural Engineering";
  if (/architect/.test(source)) return "Architecture";
  if (/project engineer|project management|supervision|site|coordination/.test(source)) return "Project Engineering";
  if (/electrical|electric/.test(source)) return "Electrical Engineering";
  return department || "Other";
}

function departmentSort(a: string, b: string) {
  const aIndex = DEPARTMENT_ORDER.indexOf(a);
  const bIndex = DEPARTMENT_ORDER.indexOf(b);
  const aRank = aIndex === -1 ? DEPARTMENT_ORDER.length : aIndex;
  const bRank = bIndex === -1 ? DEPARTMENT_ORDER.length : bIndex;
  return aRank - bRank || a.localeCompare(b);
}

function departmentMeta(label: string) {
  return DEPARTMENT_META[label] || {
    eyebrow: "SPECIALIST DISCIPLINE",
    title: label,
    description: "Specialist consultancy and technical support integrated with LAND VIEW's wider project delivery team.",
    className: "other",
  };
}

function initialsFor(name?: string) {
  return text(name || "LV").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ProfileDetails({ member, compact = false }: { member: PublicTeamMember; compact?: boolean }) {
  const { position, department, degrees, specialities } = memberView(member);
  return <div className="tv2-profile-copy">
    <div className="tv2-profile-heading">
      <h3>{text(member.name) || "LAND VIEW Team Member"}</h3>
      {position ? <p className="tv2-position">{position}</p> : null}
      {department && department !== position ? <p className="tv2-department">{department}</p> : null}
    </div>
    {degrees.length ? <div className="tv2-block"><span className="tv2-label">Qualifications</span><div className="tv2-lines">{degrees.slice(0, compact ? 3 : 5).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div> : null}
    {specialities.length ? <div className="tv2-block"><span className="tv2-label">Professional profile</span><div className="tv2-tags">{specialities.slice(0, compact ? 4 : 7).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div> : null}
    <div className="tv2-card-actions">
      {member.linkedInUrl ? <a href={member.linkedInUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a> : null}
      <Link href="/projects">View Projects</Link>
    </div>
  </div>;
}

function LeadProfile({ member, department }: { member: PublicTeamMember; department: string }) {
  const meta = departmentMeta(department);
  const { position } = memberView(member);
  const photo = normalizePhotoUrl(member.photoUrl, "w1600");
  return <article className="tv2-lead-card">
    <div className="tv2-lead-photo-wrap">
      {photo ? <img className="tv2-photo" src={photo} alt={`${text(member.name) || "LAND VIEW team member"}${position ? ` — ${position}` : ""}`} /> : <div className="tv2-photo-fallback">{initialsFor(member.name)}</div>}
      <span className="tv2-profile-index">LEAD PROFILE</span>
      <span className="tv2-dept-chip">{meta.title}</span>
    </div>
    <ProfileDetails member={member} />
  </article>;
}

function SupportProfile({ member }: { member: PublicTeamMember }) {
  const department = departmentLabel(member);
  const meta = departmentMeta(department);
  const { position } = memberView(member);
  const photo = normalizePhotoUrl(member.photoUrl, "w1000");
  return <article className="tv2-card">
    <div className="tv2-photo-wrap">
      {photo ? <img className="tv2-photo" src={photo} alt={`${text(member.name) || "LAND VIEW team member"}${position ? ` — ${position}` : ""}`} /> : <div className="tv2-photo-fallback">{initialsFor(member.name)}</div>}
      <span className="tv2-dept-chip">{meta.title}</span>
    </div>
    <ProfileDetails member={member} compact />
  </article>;
}

function DepartmentSection({ label, members, number }: { label: string; members: PublicTeamMember[]; number: number }) {
  const meta = departmentMeta(label);
  const lead = members[0];
  const support = members.slice(1);
  return <section className={`tv2-discipline tv2-discipline-${meta.className}`} id={`team-${meta.className}`}>
    <div className="tv2-container">
      <div className="tv2-discipline-head">
        <div className="tv2-discipline-number">{String(number).padStart(2, "0")}</div>
        <div className="tv2-discipline-title">
          <span className="tv2-kicker">{meta.eyebrow}</span>
          <h2>{meta.title}</h2>
        </div>
        <p>{meta.description}</p>
      </div>
      <div className={`tv2-discipline-layout${support.length ? " has-support" : " solo"}`}>
        <LeadProfile member={lead} department={label} />
        {support.length ? <div className="tv2-support-grid">{support.map((member, index) => <SupportProfile key={`${text(member.name)}-${index}`} member={member} />)}</div> : null}
      </div>
    </div>
  </section>;
}

export default function PublicTeamV2({ members }: { members: PublicTeamMember[] }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");

  const departments = useMemo(() => Array.from(new Set(members.map(departmentLabel).filter(Boolean))).sort(departmentSort), [members]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members.filter((member) => {
      const view = memberView(member);
      const dept = departmentLabel(member);
      const haystack = [member.name, view.position, view.department, ...view.degrees, ...view.specialities].map(text).join(" ").toLowerCase();
      return (department === "All" || dept === department) && (!term || haystack.includes(term));
    });
  }, [members, query, department]);

  const sections = useMemo(() => departments
    .map((label) => ({ label, members: filtered.filter((member) => departmentLabel(member) === label) }))
    .filter((group) => group.members.length), [departments, filtered]);

  return <>
    <section className="tv2-summary"><div className="tv2-container tv2-summary-grid">
      <div><span className="tv2-kicker">PEOPLE BEHIND THE PROJECTS</span><h2>A studio built around specialist disciplines.</h2></div>
      <div className="tv2-summary-stats">
        <div><strong>{members.length}</strong><span>Public team members</span></div>
        <div><strong>{departments.length}</strong><span>Disciplines</span></div>
        <div><strong>01—03</strong><span>Core delivery groups</span></div>
      </div>
    </div></section>

    <section className="tv2-studio-tools"><div className="tv2-container tv2-tools-inner">
      <label className="tv2-search"><span>Search the studio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, role, qualification or speciality…" /></label>
      <div className="tv2-filters" role="group" aria-label="Filter team by discipline">
        {["All", ...departments].map((item) => <button type="button" key={item} className={department === item ? "active" : ""} onClick={() => setDepartment(item)}>{item}</button>)}
      </div>
      <div className="tv2-result-line"><strong>{filtered.length}</strong><span>profile{filtered.length === 1 ? "" : "s"}</span></div>
    </div></section>

    {sections.length ? sections.map((group) => <DepartmentSection key={group.label} label={group.label} members={group.members} number={departments.indexOf(group.label) + 1} />) : <section className="tv2-directory"><div className="tv2-container"><div className="tv2-empty">No public team member matches this search or discipline.</div></div></section>}

    <section className="tv2-cta"><div className="tv2-container tv2-cta-inner"><div><span className="tv2-kicker">WORK WITH LAND VIEW</span><h2>Bring architecture, engineering and site coordination together.</h2><p>Explore the services our team provides, review published projects, or send your project brief directly to LAND VIEW.</p></div><div className="tv2-cta-actions"><Link href="/services">Explore Services</Link><Link href="/projects" className="secondary">View Projects</Link><Link href="/contact" className="secondary">Start an Enquiry</Link></div></div></section>
  </>;
}
