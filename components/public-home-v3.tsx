"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { publicServices } from "@/lib/public-services";
import { defaultWebsiteContent, normalizeWebsiteContent, type WebsiteContentSettings } from "@/lib/website-content";

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
type TeamMember = {
  name?: string; title?: string; designation?: string; position?: string;
  department?: string; speciality?: string; specialities?: string; photoUrl?: string;
};
type PublicSummary = { projects: number; active: number; mapped: number; districts: number };
type HomeProps = {
  initialProjects?: PublicProject[];
  initialTeam?: TeamMember[];
  initialContent?: WebsiteContentSettings;
  initialSummary?: PublicSummary;
};

const navigation = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/projects", label: "Projects" },
  { href: "/#about", label: "About" },
  { href: "/team", label: "Team" },
  { href: "/contact", label: "Contact" },
];

const servicePillars = [
  {
    number: "01", title: "Design & engineering", description: "Spaces planned for people. Structures engineered for real site conditions.",
    slugs: ["architectural-design", "structural-design", "3d-exterior-design", "3d-interior-design", "electrical-design", "plumbing-design"],
  },
  {
    number: "02", title: "Preparation & approval", description: "The technical groundwork needed to plan, budget and document a project.",
    slugs: ["estimate-costing", "plan-approval", "digital-survey", "soil-test"],
  },
  {
    number: "03", title: "Construction support", description: "Stay connected to the design during the building process.",
    slugs: ["site-supervision"],
  },
];

function displayImage(value?: string, width = "w1200") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (match) return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(match[1]) + "&sz=" + width;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=" + width;
    }
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {}
  return "";
}

function projectLink(project: PublicProject) {
  return project.projectId ? "/projects/" + encodeURIComponent(project.projectId) : "/projects";
}

function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="lvw-header">
      <div className="lvw-shell lvw-header-inner">
        <Link className="lvw-brand" href="/" onClick={() => setMenuOpen(false)} aria-label="LAND VIEW home">
          <img src="/land-view-logo.svg" width={46} height={46} alt="" />
          <span><strong>LAND <em>VIEW</em></strong><small>Engineers & Architects</small></span>
        </Link>
        <nav id="lvw-navigation" className={menuOpen ? "lvw-nav lvw-nav-open" : "lvw-nav"} aria-label="Main navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>
          ))}
          <a className="lvw-mobile-login" href="https://app.landview.com.bd/login">Client login</a>
        </nav>
        <div className="lvw-header-actions">
          <a className="lvw-login" href="https://app.landview.com.bd/login">Client login</a>
          <Link className="lvw-header-contact" href="/contact">Start a project <span aria-hidden="true">↗</span></Link>
          <button className="lvw-menu-toggle" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-controls="lvw-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

export default function PublicHomeV3({ initialProjects, initialTeam, initialContent, initialSummary }: HomeProps) {
  const [projects, setProjects] = useState<PublicProject[]>(initialProjects || []);
  const [team, setTeam] = useState<TeamMember[]>(initialTeam || []);
  const [content, setContent] = useState<WebsiteContentSettings>(initialContent || defaultWebsiteContent);

  // Public-only API fallback: the live website still works when server snapshot retrieval fails.
  useEffect(() => {
    if (initialProjects && initialTeam && initialContent) return;
    const controller = new AbortController();
    async function readPublicData() {
      const requests = [
        fetch("/api/public/projects", { signal: controller.signal, cache: "no-store" }),
        fetch("/api/public/team", { signal: controller.signal, cache: "no-store" }),
        fetch("/api/public/site-content", { signal: controller.signal, cache: "no-store" }),
      ];
      const responses = await Promise.allSettled(requests);
      if (controller.signal.aborted) return;
      const json = await Promise.all(responses.map(async (result) => {
        if (result.status !== "fulfilled" || !result.value.ok) return null;
        try { return await result.value.json(); } catch { return null; }
      }));
      if (controller.signal.aborted) return;
      const projectRows = json[0]?.data ?? json[0];
      if (Array.isArray(projectRows)) setProjects(projectRows);
      const teamRows = json[1]?.data ?? json[1]?.team ?? json[1]?.employees ?? json[1];
      if (Array.isArray(teamRows)) setTeam(teamRows);
      if (json[2]?.success) setContent(normalizeWebsiteContent(json[2].data));
    }
    void readPublicData();
    return () => controller.abort();
  }, [initialProjects, initialTeam, initialContent]);

  const heroProject = useMemo(() =>
    projects.find((project) => project.coverImageUrl && project.publicReady !== false) ||
    projects.find((project) => project.coverImageUrl) || null, [projects]);
  const featured = useMemo(() => {
    const withImages = projects.filter((project) => project.coverImageUrl);
    return [...withImages, ...projects.filter((project) => !project.coverImageUrl)].slice(0, 3);
  }, [projects]);
  const homepage = content.homepage;
  const visible = homepage.sections;
  const publishedFaqs = content.faq.filter((faq) => faq.published).sort((a, b) => a.order - b.order);
  const process = content.process.filter((step) => step.published).sort((a, b) => a.order - b.order);
  const stats = content.stats.filter((stat) => stat.published).slice(0, 4);
  const counts = initialSummary;
  const socials = Object.entries(content.social).filter(([, url]) => Boolean(url));
  const heroImage = displayImage(heroProject?.coverImageUrl, "w1600");

  return (
    <div className="lvw-site">
      <a className="lvw-skip" href="#main-content">Skip to main content</a>
      <MarketingHeader />
      <main id="main-content">
        <section className="lvw-hero" id="home" aria-labelledby="lvw-hero-heading">
          <div className="lvw-shell lvw-hero-grid">
            <div className="lvw-hero-copy">
              <div className="lvw-eyebrow lvw-eyebrow-light"><span className="lvw-red-line" /> {homepage.eyebrow}</div>
              <h1 id="lvw-hero-heading">Architectural design.<br /><em>Structural confidence.</em></h1>
              <p className="lvw-hero-location">Architecture & engineering consultancy in Feni, Bangladesh.</p>
              <p className="lvw-hero-description">{homepage.intro}</p>
              <div className="lvw-actions">
                <a className="lvw-button lvw-button-red" href={homepage.primaryCtaHref}>{homepage.primaryCtaLabel}<span aria-hidden="true">↗</span></a>
                <a className="lvw-button lvw-button-outline" href={homepage.secondaryCtaHref}>{homepage.secondaryCtaLabel}<span aria-hidden="true">→</span></a>
              </div>
              <div className="lvw-hero-foot"><span>Residential & commercial</span><span>Design through construction support</span></div>
            </div>
            <div className="lvw-hero-visual">
              {heroImage ? (
                <img src={heroImage} width={1200} height={900} loading="eager" fetchPriority="high" decoding="async" alt={heroProject?.title || "LAND VIEW building design project"} />
              ) : (
                <div className="lvw-hero-placeholder" aria-hidden="true"><div className="lvw-blueprint" /></div>
              )}
              <div className="lvw-hero-visual-caption">
                <span>FEATURED PROJECT</span>
                <strong>{heroProject?.title || "Designed with purpose"}</strong>
                <small>{[heroProject?.category, heroProject?.district || heroProject?.location].filter(Boolean).join(" · ") || "LAND VIEW Engineers & Architects"}</small>
                <Link href={heroProject ? projectLink(heroProject) : "/projects"} aria-label="Explore LAND VIEW projects">View work <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
          </div>
        </section>

        {visible.stats && stats.length > 0 && (
          <section className="lvw-metrics" aria-label="LAND VIEW project statistics">
            <div className="lvw-shell lvw-metrics-grid">
              {stats.map((stat, index) => {
                const totals: Record<string, number | undefined> = { projects: counts?.projects, active: counts?.active, mapped: counts?.mapped, districts: counts?.districts };
                const value = stat.source === "custom" ? (stat.value || "0") : totals[stat.source];
                return <div className="lvw-metric" key={stat.label + index}>
                  <strong>{value ?? "—"}{value !== undefined ? stat.suffix || "" : ""}</strong>
                  <span>{stat.label}</span>
                </div>;
              })}
            </div>
          </section>
        )}

        {visible.services && (
          <section className="lvw-section lvw-services" id="services">
            <div className="lvw-shell">
              <div className="lvw-section-top">
                <div><span className="lvw-eyebrow">01 / OUR EXPERTISE</span><h2>One team. Every critical<br />stage of your building.</h2></div>
                <div className="lvw-section-aside"><p>From the first floor-plan idea to technical drawings and construction-stage coordination, we approach your building as one connected project.</p><Link className="lvw-text-action" href="/services">Explore all services <span aria-hidden="true">↗</span></Link></div>
              </div>
              <div className="lvw-service-groups">
                {servicePillars.map((group) => (
                  <div className="lvw-service-group" key={group.number}>
                    <div className="lvw-group-intro"><span>{group.number} / EXPERTISE</span><h3>{group.title}</h3><p>{group.description}</p></div>
                    <div className="lvw-service-cards">
                      {group.slugs.map((slug) => {
                        const service = publicServices.find((item) => item.slug === slug);
                        if (!service) return null;
                        return <Link href={"/services/" + service.slug} className="lvw-service-card" key={slug}>
                          <span className="lvw-service-icon" aria-hidden="true">{service.icon}</span>
                          <h4>{service.name}</h4>
                          <p>{service.shortDescription}</p>
                          <span className="lvw-card-arrow" aria-hidden="true">↗</span>
                        </Link>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {visible.featuredProjects && (
          <section className="lvw-section lvw-projects" id="projects">
            <div className="lvw-shell">
              <div className="lvw-section-top">
                <div><span className="lvw-eyebrow">02 / SELECTED WORK</span><h2>Real projects.<br /><em>Real places.</em></h2></div>
                <div className="lvw-section-aside"><p>Explore actual LAND VIEW projects, with available design scope, project stages, and locations from our public portfolio.</p><Link className="lvw-text-action" href="/projects">View project portfolio <span aria-hidden="true">↗</span></Link></div>
              </div>
              {featured.length ? <div className="lvw-project-grid">{featured.map((project, index) => {
                const cover = displayImage(project.coverImageUrl, "w1200");
                return <Link href={projectLink(project)} className="lvw-project" key={project.projectId || String(index)}>
                  <div className="lvw-project-image">
                    {cover ? <img src={cover} alt={project.title || "LAND VIEW building project"} loading="lazy" decoding="async" width={720} height={600} /> : <div className="lvw-project-fallback" aria-hidden="true" />}
                    {project.category && <span className="lvw-project-type">{project.category}</span>}
                  </div>
                  <div className="lvw-project-information">
                    <div><span>{project.district || project.location || "Bangladesh"}</span><span>{project.currentStage || "Building design"}</span></div>
                    <h3>{project.title || project.projectId || "LAND VIEW Project"}</h3>
                    <span className="lvw-project-link">Project details <span aria-hidden="true">↗</span></span>
                  </div>
                </Link>;
              })}</div> : <div className="lvw-empty">Our published building projects are available in the <Link href="/projects">project portfolio</Link>.</div>}
              <div className="lvw-project-links"><Link href="/case-studies">Read case studies <span aria-hidden="true">↗</span></Link><Link href="/projects/map">Explore project map <span aria-hidden="true">↗</span></Link></div>
            </div>
          </section>
        )}

        {visible.process && (
          <section className="lvw-section lvw-process" id="process">
            <div className="lvw-shell">
              <div className="lvw-section-top">
                <div><span className="lvw-eyebrow">03 / OUR PROCESS</span><h2>A clearer path from<br />idea to execution.</h2></div>
                <p className="lvw-section-aside">Every building has different needs. Our process keeps planning, technical coordination and delivery aligned with the agreed project scope.</p>
              </div>
              <div className="lvw-process-grid">
                {process.map((step, index) => <article key={step.title + index}><span>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}
              </div>
            </div>
          </section>
        )}

        {visible.whyUs && (
          <section className="lvw-section lvw-about" id="about">
            <div className="lvw-shell lvw-about-grid">
              <div><span className="lvw-eyebrow">04 / WHY LAND VIEW</span><h2>Built on thoughtful design.<br /><em>Grounded in engineering.</em></h2><p>LAND VIEW brings architecture, engineering and construction-stage support into one coordinated workflow—making technical decisions clearer for owners, builders and project teams.</p><Link className="lvw-button lvw-button-dark" href="/services">Our expertise <span aria-hidden="true">↗</span></Link></div>
              <div className="lvw-values">
                {[
                  ["01", "Coordinated from the start", "Architecture and structural thinking inform one another, instead of competing at the construction stage."],
                  ["02", "Practical and buildable", "Design decisions are made with site conditions, functionality and execution in mind."],
                  ["03", "Clear documentation", "Coordinated drawing packages help everyone work from a common technical direction."],
                  ["04", "Connected to the site", "Projects can continue into agreed supervision and design-to-site coordination."]
                ].map(([number, title, description]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}
              </div>
            </div>
          </section>
        )}

        {visible.map && (
          <section className="lvw-location-band"><div className="lvw-shell lvw-location-inner">
            <div><span className="lvw-eyebrow">PROJECT LOCATIONS</span><h2>See where our work takes shape.</h2><p>Explore the locations and project information that LAND VIEW has chosen to publish.</p></div>
            <Link className="lvw-button lvw-button-outline" href="/projects/map">Explore the map <span aria-hidden="true">↗</span></Link>
          </div></section>
        )}

        {visible.team && (
          <section className="lvw-section lvw-team" id="team">
            <div className="lvw-shell">
              <div className="lvw-section-top"><div><span className="lvw-eyebrow">05 / OUR PEOPLE</span><h2>Meet the team behind<br />the plans.</h2></div><div className="lvw-section-aside"><p>Our team combines different responsibilities across architectural planning, engineering and project coordination.</p><Link className="lvw-text-action" href="/team">Meet the full team <span aria-hidden="true">↗</span></Link></div></div>
              {team.length ? <div className="lvw-team-grid">{team.slice(0,4).map((member,index) => {
                const role = member.position || member.designation || member.title || member.department || "LAND VIEW Team";
                const photo = displayImage(member.photoUrl, "w600");
                return <article className="lvw-team-member" key={(member.name || "member") + index}>
                  <div className="lvw-team-image">{photo ? <img src={photo} width={420} height={500} loading="lazy" decoding="async" alt={member.name || "LAND VIEW team member"} /> : <span aria-hidden="true">LV</span>}</div>
                  <div><h3>{member.name || "LAND VIEW Team"}</h3><p>{role}</p></div>
                </article>;
              })}</div> : <p className="lvw-empty">Explore our <Link href="/team">team directory</Link> for published profiles.</p>}
            </div>
          </section>
        )}

        {visible.clientPortal && (
          <section className="lvw-portal"><div className="lvw-shell lvw-portal-grid">
            <div><span className="lvw-eyebrow">FOR EXISTING CLIENTS</span><h2>Stay connected to<br />your project.</h2><p>Your project information, available records and stage updates remain linked to LAND VIEW's client portal.</p></div>
            <div className="lvw-portal-card"><span>LAND VIEW CLIENT PORTAL</span><h3>Already working with us?</h3><p>Use your project file ID and registered mobile number to access available project details.</p><Link className="lvw-button lvw-button-red" href="/client">Open client portal <span aria-hidden="true">↗</span></Link></div>
          </div></section>
        )}

        {visible.faq && publishedFaqs.length > 0 && (
          <section className="lvw-section lvw-faq"><div className="lvw-shell lvw-faq-grid">
            <div><span className="lvw-eyebrow">COMMON QUESTIONS</span><h2>Questions before<br />the first meeting?</h2><p>Understand the consultancy process and prepare the right information for a useful conversation.</p></div>
            <div>{publishedFaqs.map((faq,index) => <details key={faq.question + index}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</div>
          </div></section>
        )}

        {visible.contact && (
          <section className="lvw-section lvw-contact" id="contact"><div className="lvw-shell lvw-contact-grid">
            <div><span className="lvw-eyebrow lvw-eyebrow-light">LET'S BUILD SOMETHING BETTER</span><h2>Have a site in mind?<br /><em>Let's discuss it.</em></h2><p>Tell us where your project is, the intended building use, proposed floors and what support you need.</p><div className="lvw-actions"><Link className="lvw-button lvw-button-red" href="/contact">Contact LAND VIEW <span aria-hidden="true">↗</span></Link><a className="lvw-button lvw-button-outline" href={"https://wa.me/" + content.general.whatsappPhone.replace(/\D/g,"")} target="_blank" rel="noopener noreferrer">WhatsApp <span aria-hidden="true">↗</span></a></div></div>
            <div className="lvw-contact-details">
              <div><span>VISIT OUR OFFICE</span><p>{content.general.officeAddress}</p><a href={content.general.mapsUrl} target="_blank" rel="noopener noreferrer">Get directions ↗</a></div>
              <div><span>ARCHITECTURE</span><a href={"tel:" + content.general.architecturePhone}>{content.general.architecturePhone}</a></div>
              <div><span>ENGINEERING</span><a href={"tel:" + content.general.engineeringPhone}>{content.general.engineeringPhone}</a></div>
              <div><span>EMAIL</span><a href={"mailto:" + content.general.email}>{content.general.email}</a></div>
            </div>
          </div></section>
        )}
      </main>
      <footer className="lvw-footer"><div className="lvw-shell lvw-footer-inner">
        <div><strong>LAND <em>VIEW</em></strong><p>{content.footer.blurb}</p><small>{content.footer.copyright}</small></div>
        <nav aria-label="Footer"><Link href="/services">Services</Link><Link href="/projects">Projects</Link><Link href="/case-studies">Case studies</Link><Link href="/feni">Feni office</Link><Link href="/bn">বাংলা</Link><Link href="/contact">Contact</Link>{socials.map(([key,url]) => <a href={url} key={key} target="_blank" rel="noopener noreferrer">{key}</a>)}</nav>
      </div></footer>
    </div>
  );
}
