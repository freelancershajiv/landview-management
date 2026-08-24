"use client";

import { useEffect, useState } from "react";
import PublicHeader from "@/components/public-header";


type PublicTeamMember = {
  name?: string;
  title?: string;
  designation?: string;
  position?: string;
  department?: string;
  degree?: string;
  degrees?: string;
  speciality?: string;
  specialities?: string;
  bio?: string;
  photoUrl?: string;
  linkedInUrl?: string;
};

const PUBLIC_POSITION_PREFIX = "__POSITION__:";

function getPublicImageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";

  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1000`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`;
    }
  } catch { return value; }
  return value;
}

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
  const rawLines = String(value || "").split(/\r?\n/);
  const contentLines: string[] = [];

  rawLines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith(PUBLIC_POSITION_PREFIX)) {
      position = trimmed.slice(PUBLIC_POSITION_PREFIX.length).trim();
    } else if (trimmed) {
      contentLines.push(trimmed);
    }
  });

  const items = splitCredentialText(contentLines.join("\n"));
  const degrees: string[] = [];
  const specialities: string[] = [];

  items.forEach((item) => {
    if (isDegreeLine(item)) degrees.push(item);
    else specialities.push(item);
  });

  return { position, degrees, specialities };
}

function TeamCard({ member, index }: { member: PublicTeamMember; index: number }) {
  const parsedBio = splitBio(member.bio);
  const designation = member.designation || member.title || "";
  const position = member.position || parsedBio.position || "";
  const department = member.department || "";

  const explicitDegrees = splitCredentialText(member.degrees || member.degree || "");
  const degrees = explicitDegrees.length ? explicitDegrees : parsedBio.degrees;

  const specialitiesValue = member.specialities || member.speciality || "";
  const specialities = specialitiesValue
    ? splitCredentialText(specialitiesValue)
    : parsedBio.specialities;

  const initials = String(member.name || "LV").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();

  return (
    <article className="public-team-card">
      <div className="public-team-card-accent" aria-hidden="true" />
      <div className="public-team-photo">
        {member.photoUrl ? <img src={getPublicImageUrl(member.photoUrl)} alt={member.name || "LAND VIEW team member"} /> : <span>{initials}</span>}
      </div>
      <div className="public-team-copy">
        <span className="public-team-index">{String(index + 1).padStart(2, "0")}</span>
        <h3>
          {designation ? <><span className="public-team-designation">{designation}</span>{" "}</> : null}
          <span className="public-team-name">{member.name}</span>
        </h3>
        {position ? <div className="public-team-info-block"><span className="public-team-label">POSITION</span><strong>{position}</strong></div> : null}
        {department ? <div className="public-team-info-block"><span className="public-team-label">DEPARTMENT</span><strong>{department}</strong></div> : null}
        {degrees.length || specialities.length ? (
          <div className="public-team-info-block public-team-credentials">
            <span className="public-team-label">DEGREES &amp; SPECIALITIES</span>
            {degrees.length ? (
              <div className="public-team-degrees">
                {degrees.map((item, itemIndex) => <small className="public-team-degree" key={`${item}-${itemIndex}`}>{item}</small>)}
              </div>
            ) : null}
            {specialities.length ? <div className="public-team-specialities">{specialities.map((item, itemIndex) => <span key={`${item}-${itemIndex}`}>{item}</span>)}</div> : null}
          </div>
        ) : null}
        {member.linkedInUrl ? <a href={member.linkedInUrl} target="_blank" rel="noreferrer">LinkedIn <span>↗</span></a> : null}
      </div>
      <div className="public-team-card-bottom" aria-hidden="true"><span /></div>
    </article>
  );
}

function PublicTeamSection() {
  const [team, setTeam] = useState<PublicTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function loadTeam() {
      try {
        const response = await fetch("/api/public/team", { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (Array.isArray(data?.data)) setTeam(data.data);
        else if (Array.isArray(data?.team)) setTeam(data.team);
        else if (Array.isArray(data?.employees)) setTeam(data.employees);
        else if (Array.isArray(data)) setTeam(data);
        else setTeam([]);
      } catch (error) {
        console.error("Failed to load public team:", error);
        if (!cancelled) setTeam([]);
      } finally { if (!cancelled) setLoading(false); }
    }
    loadTeam();
    return () => { cancelled = true; };
  }, []);
  return (
    <section className="public-section public-team" id="team"><div className="public-container">
      <div className="public-section-head"><div><span className="public-section-kicker">OUR TEAM</span><h2>The people behind LAND VIEW.</h2></div><p>Engineers and architects working together across design, technical coordination and project delivery.</p></div>
      {loading ? <div className="public-team-empty">Loading team members...</div> : team.length ? <div className="public-team-grid">{team.map((member, index) => <TeamCard key={`${member.name || "team-member"}-${index}`} member={member} index={index} />)}</div> : <div className="public-team-empty">No team members are available right now.</div>}
    </div></section>
  );
}

const services = [
  { number: "01", title: "Architectural Design", text: "Building planning, floor plans, elevations and architectural drawing packages developed around the site and client requirements.", icon: "⌂" },
  { number: "02", title: "Structural Design", text: "Structural analysis, reinforced-concrete design and detailing focused on safety, efficiency and practical construction.", icon: "▦" },
  { number: "03", title: "3D Design - Exterior", text: "Exterior 3D modeling and visualization to communicate building form, facade, materials and overall architectural character.", icon: "◇" },
  { number: "04", title: "3D Design - Interior", text: "Interior 3D design and visualization for spatial planning, finishes, furniture concepts and presentation-ready views.", icon: "◫" },
  { number: "05", title: "Electrical Design", text: "Electrical layouts for lighting, power points, distribution and coordinated building-service planning.", icon: "⚡" },
  { number: "06", title: "Plumbing Design", text: "Water-supply, sanitary and drainage layouts coordinated with the architectural and structural design.", icon: "≈" },
  { number: "07", title: "Estimate & Costing", text: "Quantity takeoff, BOQ preparation and project cost estimation to support budgeting and construction decisions.", icon: "∑" },
  { number: "08", title: "Plan Approval", text: "Preparation and coordination of drawings and documents required for the building plan approval process.", icon: "✓" },
  { number: "09", title: "Digital Survey", text: "Digital site and land survey support for accurate measurements, existing-condition information and project planning.", icon: "⌖" },
  { number: "10", title: "Soil Test", text: "Soil investigation and testing support to provide geotechnical information for safe and appropriate foundation decisions.", icon: "◉" },
];

const projects = [
  { code: "ARCHITECTURE", title: "Residential Design", text: "Efficient homes planned around daylight, circulation, privacy and buildable detailing.", className: "project-art-one" },
  { code: "ENGINEERING", title: "Structural Design", text: "Coordinated structural systems developed for safety, economy and construction practicality.", className: "project-art-two" },
  { code: "DELIVERY", title: "Site & Project Support", text: "Design-to-site coordination with supervision, documentation and professional follow-through.", className: "project-art-three" },
];

const process = [
  ["01", "Brief", "Understand the site, requirements, budget and project goals."],
  ["02", "Design", "Develop coordinated architectural and engineering solutions."],
  ["03", "Documentation", "Prepare drawings and technical information for execution."],
  ["04", "Delivery", "Support construction with supervision and project coordination."],
];

export default function PublicHomePage() {
  return (
    <main className="public-site" id="home">
      <PublicHeader />
      <section className="public-hero"><div className="public-hero-grid" /><div className="public-hero-orbit public-hero-orbit-one" /><div className="public-hero-orbit public-hero-orbit-two" /><div className="public-container public-hero-inner">
        <div className="public-hero-copy"><span className="public-overline">ENGINEERS & ARCHITECTS</span><div className="public-hero-tag">DESIGNED TO DELIVER</div><h1>Architecture that works.<span> Engineering that lasts.</span></h1><p>LAND VIEW Engineers & Architects brings architectural design, structural design, building services, visualization and technical support into one coordinated consultancy.</p><div className="public-hero-actions"><a href="#services" className="public-btn public-btn-accent">Explore Services <span>→</span></a><a href="#contact" className="public-btn public-btn-outline">Start a Project</a></div></div>
        <aside className="public-hero-panel"><span className="public-panel-kicker">LAND VIEW</span><strong>One team.</strong><strong>One workflow.</strong><small>Architecture • Engineering • Visualization</small><div className="public-panel-rule" /><p>From the first sketch to technical delivery, every stage is coordinated around buildability and clear communication.</p></aside>
      </div></section>
      <section className="public-quick-band" aria-label="LAND VIEW services overview"><div className="public-quick-label"><span className="public-quick-ring">LV</span><div><small>DISCOVER</small><strong>What we do</strong></div></div><div className="public-quick-links"><a href="#services">Architecture</a><a href="#services">Structure</a><a href="#services">3D Design</a><a href="#services">MEP Design</a><a href="#services">Survey & Soil Test</a><a href="#contact" className="dark">Get Consultation</a></div></section>
      <section className="public-section public-services" id="services"><div className="public-container"><div className="public-section-head"><div><span className="public-section-kicker">WHAT WE DO</span><h2>Complete building design and technical services.</h2></div><p>LAND VIEW Engineers & Architects coordinates architecture, structure, visualization, building services, costing, approvals, survey and soil investigation for a more complete project workflow.</p></div><div className="public-service-grid">{services.map((service) => <article className="public-service-card" key={service.number}><div className="public-service-top"><span>{service.number}</span><b>{service.icon}</b></div><h3>{service.title}</h3><p>{service.text}</p><a href="#contact">Discuss your project <span>→</span></a></article>)}</div></div></section>
      <section className="public-about" id="about"><div className="public-about-technical" /><div className="public-container public-about-grid"><div className="public-about-copy"><span className="public-section-kicker light">ABOUT LAND VIEW</span><h2>Built around clear thinking and practical delivery.</h2><p>LAND VIEW Engineers & Architects approaches each project as one coordinated design problem—not separate architectural, structural and technical tasks.</p><p>The result is a more direct path from concept to drawings to site, with technical decisions considered early and communicated clearly.</p><a href="#contact" className="public-text-link">Work with LAND VIEW <span>→</span></a></div><div className="public-about-card"><span>OUR APPROACH</span><div className="public-about-row"><b>01</b><div><strong>Integrated</strong><small>Architecture and engineering coordinated together.</small></div></div><div className="public-about-row"><b>02</b><div><strong>Practical</strong><small>Solutions shaped for real construction conditions.</small></div></div><div className="public-about-row"><b>03</b><div><strong>Accountable</strong><small>Clear documentation and project follow-through.</small></div></div></div></div></section>
      <PublicTeamSection />
      <section className="public-section public-projects" id="projects"><div className="public-container"><div className="public-section-head"><div><span className="public-section-kicker">FEATURED WORK</span><h2>Designed for the way projects are actually built.</h2></div><p>This portfolio area is ready for your real project photographs, drawings and completed LAND VIEW work.</p></div><div className="public-project-grid">{projects.map((project) => <article className="public-project-card" key={project.title}><div className={`public-project-art ${project.className}`}><div className="public-project-lines" /><span>{project.code}</span></div><div className="public-project-copy"><h3>{project.title}</h3><p>{project.text}</p><span className="public-project-link">LAND VIEW PROJECTS →</span></div></article>)}</div></div></section>
      <section className="public-process" id="process"><div className="public-container"><div className="public-section-head compact light-head"><div><span className="public-section-kicker light">HOW WE WORK</span><h2>A clear path from brief to delivery.</h2></div></div><div className="public-process-grid">{process.map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
      <section className="public-contact" id="contact"><div className="public-container public-contact-grid"><div className="public-contact-copy"><span className="public-section-kicker light">START A CONVERSATION</span><h2>Planning a building or engineering project?</h2><p>Tell us what you are planning. LAND VIEW can help you define the right architectural, structural and technical service scope.</p><a href="mailto:landviewcivil@gmail.com" className="public-btn public-btn-white">Email LAND VIEW <span>→</span></a></div><div className="public-contact-details"><div><span>OFFICE</span><strong>F. Rahman AC Market (2nd Floor)</strong><p>S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</p><a href="https://share.google/cTmtQarK6Oo6KY8Md" target="_blank" rel="noreferrer" className="public-map-link">View office on Google Maps <span>↗</span></a></div><div><span>EMAIL</span><a href="mailto:landviewcivil@gmail.com">landviewcivil@gmail.com</a></div><div className="public-contact-phones"><div><span>ENGINEERING</span><a href="tel:+8801408080400">+88 0140 8080 400</a></div><div><span>ARCHITECTURE</span><a href="tel:+8801902500400">+88 01902 500 400</a></div></div></div></div></section>
      <footer className="public-footer"><div className="public-container public-footer-grid"><div className="public-footer-brand"><img src="/land-view-logo.png" alt="LAND VIEW" /><div><strong>LAND VIEW</strong><span>ENGINEERS & ARCHITECTS</span></div></div><div className="public-footer-links"><a href="#about">About</a><a href="#services">Services</a><a href="#projects">Projects</a><a href="#team">Team</a><a href="#contact">Contact</a></div><div className="public-footer-copy"><span>© 2026 LAND VIEW</span><small>Architecture • Engineering • Visualization</small></div></div></footer>
    </main>
  );
}
