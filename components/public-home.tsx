"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PublicHeader from "@/components/public-header";
import { publicServices, type PublicService } from "@/lib/public-services";

type PublicProject = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  district?: string;
  currentStage?: string;
  stories?: string;
  description?: string;
  coverImageUrl?: string;
  services?: string[];
  mapEnabled?: boolean;
  publicReady?: boolean;
};

type PublicTeamMember = {
  name?: string;
  title?: string;
  designation?: string;
  position?: string;
  department?: string;
  speciality?: string;
  specialities?: string;
  photoUrl?: string;
};

type ServiceGroup = {
  label: string;
  title: string;
  description: string;
  slugs: string[];
};

const serviceGroups: ServiceGroup[] = [
  {
    label: "01 / DESIGN",
    title: "Design & Engineering",
    description: "Architecture, structural engineering, visualization and coordinated building services developed as one design system.",
    slugs: ["architectural-design", "structural-design", "3d-exterior-design", "3d-interior-design", "electrical-design", "plumbing-design"],
  },
  {
    label: "02 / PRE-CONSTRUCTION",
    title: "Planning, Survey & Approval",
    description: "Technical groundwork that helps a project move from land and concept information toward documentation and approval.",
    slugs: ["estimate-costing", "plan-approval", "digital-survey", "soil-test"],
  },
  {
    label: "03 / DELIVERY",
    title: "Construction Support",
    description: "Professional follow-through during construction, with site observations and design-to-site coordination.",
    slugs: ["site-supervision"],
  },
];

const processSteps = [
  ["01", "Consultation", "Understand the land, building requirements, priorities, budget direction and expected service scope."],
  ["02", "Site Information", "Review survey, site conditions and the technical information needed before coordinated design begins."],
  ["03", "Architectural Design", "Develop planning, circulation, elevations and a practical architectural direction for the project."],
  ["04", "Engineering", "Coordinate structural and building-service design with the approved architectural solution."],
  ["05", "Approval & Documents", "Prepare the relevant drawings and technical documentation for execution and approval support."],
  ["06", "Construction Support", "Connect drawings with the site through agreed supervision, observations and project coordination."],
] as const;

const whyItems = [
  ["01", "One coordinated team", "Architecture and engineering are considered together instead of being treated as disconnected drawing packages."],
  ["02", "Practical design decisions", "Planning and technical decisions are developed around real construction conditions, usability and execution."],
  ["03", "Technical documentation", "Clear drawing packages and project information help reduce confusion between design decisions and site work."],
  ["04", "Approval support", "Relevant approval drawings and documentation can be coordinated as part of the overall consultancy scope."],
  ["05", "Digital project records", "LAND VIEW uses an integrated management system to organize project information, records and delivery workflows."],
  ["06", "Design-to-site follow-through", "Projects can continue from design into scheduled site support and construction-stage coordination."],
] as const;

const faqItems = [
  ["What services can LAND VIEW provide for a new building?", "The public service scope includes architectural design, structural design, exterior and interior 3D visualization, electrical and plumbing design, estimate and costing, plan approval support, digital survey, soil-test coordination and site supervision. The final scope depends on the project."],
  ["Can LAND VIEW coordinate architecture and structural design together?", "Yes. The consultancy is structured around coordinated architectural and engineering work so major technical decisions can be considered together rather than as isolated tasks."],
  ["Do you provide building plan approval support?", "LAND VIEW can prepare and coordinate the relevant drawing and technical documentation for the applicable approval process. Exact requirements depend on the authority and the project location."],
  ["Can I see LAND VIEW projects before contacting the office?", "Yes. The public Projects section shows selected work, and the Project Map lets you explore mapped public projects by location and project information."],
  ["What can an existing client access online?", "The LAND VIEW client portal is designed to provide project-related information and records using the client's project credentials. Available information depends on the project and its current workflow."],
  ["How do I start a project with LAND VIEW?", "Start with a consultation. Share the project location, land or site information, intended building use and the services you need. The team can then help define the appropriate scope."],
] as const;

function imageUrl(url?: string, size = "w1600") {
  const value = String(url || "").trim();
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

function projectHref(project: PublicProject) {
  return project.projectId ? `/projects/${encodeURIComponent(project.projectId)}` : "/projects";
}

function serviceGroupItems(group: ServiceGroup) {
  return group.slugs.map((slug) => publicServices.find((service) => service.slug === slug)).filter(Boolean) as PublicService[];
}

function Hero({ project }: { project: PublicProject | null }) {
  const cover = imageUrl(project?.coverImageUrl);
  const location = project?.district || project?.location || "Bangladesh";

  return (
    <section className="ph-hero" id="home">
      <div className="ph-container ph-hero-grid">
        <div className="ph-hero-copy">
          <span className="ph-kicker">LAND VIEW ENGINEERS &amp; ARCHITECTS</span>
          <h1>Design. Engineering.<em>Approval. Supervision.</em></h1>
          <p>Complete building consultancy from concept to construction. LAND VIEW coordinates architecture, structural engineering, technical design, approval support and site supervision for projects in Feni and across Bangladesh.</p>
          <div className="ph-hero-actions">
            <a href="#contact" className="ph-btn ph-btn-primary">Start Your Project <span>→</span></a>
            <Link href="/projects" className="ph-btn ph-btn-ghost">Explore Projects</Link>
            <Link href="/projects/map" className="ph-btn ph-btn-ghost">Project Map</Link>
          </div>
          <div className="ph-hero-note">
            <span>Residential &amp; commercial projects</span>
            <span>Coordinated technical consultancy</span>
          </div>
        </div>
        <div className={`ph-hero-visual ${cover ? "has-image" : ""}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          {!cover ? <div className="ph-building-placeholder" /> : null}
          <div className="ph-featured-badge">
            <small>FEATURED LAND VIEW PROJECT</small>
            <strong>{project?.title || "Architecture & Engineering"}</strong>
            <span>{[project?.category, project?.currentStage, location].filter(Boolean).join(" · ") || "Selected public work"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveStats({ projects, loading }: { projects: PublicProject[]; loading: boolean }) {
  const active = projects.filter((project) => project.currentStage && project.currentStage !== "Completed").length;
  const mapped = projects.filter((project) => project.mapEnabled).length;
  const districts = new Set(projects.map((project) => String(project.district || "").trim()).filter(Boolean)).size;
  const stats = [
    [loading ? "—" : String(projects.length), "Public Projects"],
    [loading ? "—" : String(active), "Active Project Stages"],
    [loading ? "—" : String(mapped), "Mapped Projects"],
    [loading ? "—" : String(districts), "Districts Represented"],
  ];

  return (
    <div className="ph-stats-wrap">
      <div className="ph-container ph-stats">
        {stats.map(([value, label]) => <div className="ph-stat" key={label}><strong>{value}<i>{value !== "—" ? "+" : ""}</i></strong><span>{label}</span></div>)}
      </div>
    </div>
  );
}

function ServicesSection() {
  return (
    <section className="ph-section ph-section-alt" id="services">
      <div className="ph-container">
        <div className="ph-heading">
          <div><span className="ph-kicker">WHAT WE DO</span><h2>One consultancy across the building journey.</h2></div>
          <p>Instead of presenting every service as an isolated item, LAND VIEW groups the work around the stages a client actually moves through: design, pre-construction and delivery.</p>
        </div>
        <div className="ph-service-groups">
          {serviceGroups.map((group) => {
            const items = serviceGroupItems(group);
            return (
              <article className="ph-service-group" key={group.title}>
                <div className="ph-service-group-head"><span>{group.label}</span><h3>{group.title}</h3><p>{group.description}</p></div>
                <div className="ph-service-list">
                  {items.map((service, index) => (
                    <div className="ph-service-item" key={service.slug}>
                      <div className="ph-service-item-top"><b>{service.icon}</b><span>{String(index + 1).padStart(2, "0")}</span></div>
                      <h4>{service.name}</h4>
                      <p>{service.shortDescription}</p>
                      <Link href={`/services/${service.slug}`}>Service details →</Link>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturedProjects({ projects, loading }: { projects: PublicProject[]; loading: boolean }) {
  const preferred = projects.filter((project) => project.coverImageUrl && project.publicReady !== false);
  const withImages = projects.filter((project) => project.coverImageUrl && !preferred.includes(project));
  const remaining = projects.filter((project) => !project.coverImageUrl);
  const featured = [...preferred, ...withImages, ...remaining].slice(0, 4);

  return (
    <section className="ph-section" id="projects">
      <div className="ph-container">
        <div className="ph-heading">
          <div><span className="ph-kicker">REAL PROJECTS</span><h2>See the work, location and project stage.</h2></div>
          <p>The homepage now uses LAND VIEW's public project records directly, so visitors can move from marketing content into actual project information.</p>
        </div>
        {loading ? <div className="ph-empty">Loading public projects…</div> : featured.length ? (
          <div className="ph-project-grid">
            {featured.map((project, index) => {
              const cover = imageUrl(project.coverImageUrl);
              const meta = [project.category, project.currentStage, project.stories ? `${project.stories} Storey` : "", project.district].filter(Boolean).slice(0, 4);
              const fallbackDescription = project.services?.length ? `LAND VIEW services: ${project.services.slice(0, 4).join(", ")}.` : "Explore the full public project record for available design, location and delivery information.";
              return (
                <article className={`ph-project-card ${cover ? "" : "no-image"}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined} key={project.projectId || `${project.title}-${index}`}>
                  <div className="ph-project-content">
                    <div className="ph-project-meta">{meta.map((item) => <span key={String(item)}>{item}</span>)}</div>
                    <h3>{project.title || project.projectId || "LAND VIEW Project"}</h3>
                    <p>{project.description || fallbackDescription}</p>
                    <div className="ph-project-footer">
                      <span className="ph-project-id">{project.projectId || "LAND VIEW"}</span>
                      <div className="ph-project-actions"><Link href={projectHref(project)}>View project →</Link>{project.mapEnabled ? <Link href="/projects/map">View on map</Link> : null}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="ph-empty">Public project records will appear here as they become available.</div>}
        <div className="ph-project-section-actions"><Link href="/projects" className="ph-btn ph-btn-primary">Explore All Projects</Link><Link href="/projects/map" className="ph-btn ph-btn-ghost">Open Project Map</Link></div>
      </div>
    </section>
  );
}

function ProjectMapBand({ mappedCount }: { mappedCount: number }) {
  return (
    <section className="ph-map-band">
      <div className="ph-container ph-map-band-grid">
        <div><span className="ph-kicker">PUBLIC PROJECT MAP</span><h3>Explore LAND VIEW work geographically.</h3><p>{mappedCount ? `${mappedCount} public project${mappedCount === 1 ? " is" : "s are"} currently available on the map. ` : ""}Filter projects by location and project information to understand where LAND VIEW is working.</p></div>
        <Link href="/projects/map" className="ph-btn ph-btn-primary">Explore the Map →</Link>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section className="ph-section ph-section-alt" id="process">
      <div className="ph-container">
        <div className="ph-heading"><div><span className="ph-kicker">HOW A PROJECT WORKS</span><h2>A clearer path from land to construction.</h2></div><p>Visitors should understand the professional process before they contact the office. These stages explain how the work can progress without implying that every project requires every service.</p></div>
        <div className="ph-process">{processSteps.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </div>
    </section>
  );
}

function WhyLandView() {
  return (
    <section className="ph-section" id="about">
      <div className="ph-container ph-why-grid">
        <div className="ph-why-copy"><span className="ph-kicker">WHY LAND VIEW</span><h2>Designing better. Building safer.</h2><p>LAND VIEW approaches the project as one coordinated technical problem. The goal is not simply to produce drawings, but to connect planning, engineering, documentation and construction support more clearly.</p><div className="ph-hero-actions"><Link href="/services" className="ph-btn ph-btn-primary">Explore Services</Link><a href="#contact" className="ph-btn ph-btn-ghost">Discuss a Project</a></div></div>
        <div className="ph-why-list">{whyItems.map(([number, title, description]) => <article className="ph-why-item" key={number}><b>{number}</b><h3>{title}</h3><p>{description}</p></article>)}</div>
      </div>
    </section>
  );
}

function ClientPortalSection() {
  return (
    <section className="ph-portal">
      <div className="ph-container ph-portal-grid">
        <div className="ph-portal-copy"><span className="ph-kicker">FOR EXISTING CLIENTS</span><h2>Your project does not disappear after the drawings are issued.</h2><p>The LAND VIEW client portal connects the public-facing consultancy with the internal project-management system. Existing clients can use their project credentials to access the information made available for their project.</p><div className="ph-portal-features"><span>Project information</span><span>Project stage visibility</span><span>Site-visit records</span><span>Billing &amp; project records</span></div></div>
        <div className="ph-portal-card"><span>LAND VIEW CLIENT PORTAL</span><h3>Already a client?</h3><p>Use the client portal with your LAND VIEW project credentials. Access depends on the records and workflow enabled for your project.</p><div className="ph-portal-demo"><div><span>Project</span><strong>File ID</strong></div><div><span>Verification</span><strong>Registered Mobile</strong></div><div><span>Access</span><strong>Project Dashboard</strong></div></div><Link href="/client" className="ph-btn ph-btn-primary">Open Client Portal →</Link></div>
      </div>
    </section>
  );
}

function TeamPreview({ team, loading }: { team: PublicTeamMember[]; loading: boolean }) {
  const preview = team.slice(0, 6);
  return (
    <section className="ph-section ph-section-alt" id="team">
      <div className="ph-container">
        <div className="ph-heading"><div><span className="ph-kicker">OUR TEAM</span><h2>The people behind the drawings and decisions.</h2></div><p>The homepage now shows a concise team preview. The full team directory remains available for visitors who want to explore LAND VIEW's professionals in more detail.</p></div>
        {loading ? <div className="ph-empty">Loading team members…</div> : preview.length ? <div className="ph-team-grid">{preview.map((member, index) => {
          const role = member.position || member.designation || member.title || member.department || "LAND VIEW Team";
          const specialty = member.specialities || member.speciality || member.department || "Architecture & engineering consultancy";
          const initials = String(member.name || "LV").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
          const photo = imageUrl(member.photoUrl, "w600");
          return <article className="ph-team-card" key={`${member.name || "team"}-${index}`}><div className="ph-team-photo">{photo ? <img src={photo} alt={member.name || "LAND VIEW team member"} /> : <span>{initials}</span>}</div><div><small>{role}</small><h3>{member.name || "LAND VIEW Team"}</h3><p>{specialty}</p></div></article>;
        })}</div> : <div className="ph-empty">Team profiles will appear here as public profiles become available.</div>}
        <div className="ph-team-actions"><Link href="/team" className="ph-btn ph-btn-ghost">Meet the Full Team →</Link></div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="ph-section">
      <div className="ph-container ph-faq">
        <div className="ph-faq-intro"><span className="ph-kicker">COMMON QUESTIONS</span><h2>Useful information before the first meeting.</h2><p>Clear answers reduce uncertainty and help potential clients understand what LAND VIEW can coordinate before they contact the office.</p></div>
        <div className="ph-faq-list">{faqItems.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}</summary><p>{answer}</p></details>)}</div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section className="ph-contact" id="contact">
      <div className="ph-container ph-contact-grid">
        <div className="ph-contact-copy"><span className="ph-kicker">START A CONVERSATION</span><h2>Planning a building or engineering project?</h2><p>Share the project location, intended building use, land or site information and the services you are considering. LAND VIEW can then help define the right consultancy scope.</p><div className="ph-contact-actions"><a href="mailto:landviewcivil@gmail.com" className="ph-btn ph-btn-primary">Email LAND VIEW</a><Link href="/contact" className="ph-btn ph-btn-ghost">Contact Details</Link></div></div>
        <div className="ph-contact-card"><div><span>OFFICE</span><strong>F. Rahman AC Market (2nd Floor)</strong><p>S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</p></div><div><span>EMAIL</span><a href="mailto:landviewcivil@gmail.com">landviewcivil@gmail.com</a></div><div><span>ENGINEERING</span><a href="tel:+8801408080400">+88 0140 8080 400</a></div><div><span>ARCHITECTURE</span><a href="tel:+8801902500400">+88 01902 500 400</a></div></div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ph-footer"><div className="ph-container ph-footer-grid"><div className="ph-footer-brand"><img src="/land-view-logo.svg" alt="LAND VIEW" /><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></div><div className="ph-footer-links"><a href="#about">About</a><Link href="/services">Services</Link><Link href="/projects">Projects</Link><Link href="/projects/map">Project Map</Link><Link href="/team">Team</Link><Link href="/contact">Contact</Link></div><div className="ph-footer-copy"><span>© 2026 LAND VIEW</span><small>Designing Better. Building Safer.</small></div></div></footer>
  );
}

export default function PublicHomePage() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [team, setTeam] = useState<PublicTeamMember[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      try {
        const response = await fetch("/api/public/projects", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setProjects(Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }
    async function loadTeam() {
      try {
        const response = await fetch("/api/public/team", { cache: "no-store" });
        const payload = await response.json();
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.team) ? payload.team : Array.isArray(payload?.employees) ? payload.employees : Array.isArray(payload) ? payload : [];
        if (!cancelled) setTeam(rows);
      } catch {
        if (!cancelled) setTeam([]);
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    }
    void loadProjects();
    void loadTeam();
    return () => { cancelled = true; };
  }, []);

  const heroProject = useMemo(() => projects.find((project) => project.coverImageUrl && project.publicReady !== false) || projects.find((project) => project.coverImageUrl) || projects[0] || null, [projects]);
  const mappedCount = useMemo(() => projects.filter((project) => project.mapEnabled).length, [projects]);

  return (
    <main className="public-home-v2">
      <PublicHeader />
      <Hero project={heroProject} />
      <LiveStats projects={projects} loading={loadingProjects} />
      <ServicesSection />
      <FeaturedProjects projects={projects} loading={loadingProjects} />
      <ProjectMapBand mappedCount={mappedCount} />
      <ProcessSection />
      <WhyLandView />
      <ClientPortalSection />
      <TeamPreview team={team} loading={loadingTeam} />
      <FaqSection />
      <ContactSection />
      <Footer />
    </main>
  );
}
