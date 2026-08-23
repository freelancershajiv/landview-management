import Link from "next/link";
import PublicHeader from "@/components/public-header";
import PublicTeamSection from "@/components/public-team-section";

const services = [
  {
    number: "01",
    title: "Architectural Design",
    text: "Planning, space design and architectural drawing packages shaped around the site, brief and construction reality.",
    icon: "⌂",
  },
  {
    number: "02",
    title: "Structural Engineering",
    text: "Practical structural analysis and design for safe, efficient reinforced-concrete building systems.",
    icon: "▦",
  },
  {
    number: "03",
    title: "Planning & Approval",
    text: "Coordinated drawings, planning support and documentation prepared for a clearer approval and construction process.",
    icon: "◇",
  },
  {
    number: "04",
    title: "Site Supervision",
    text: "Site visits, technical observations and construction guidance that help the approved design reach the field correctly.",
    icon: "⌁",
  },
  {
    number: "05",
    title: "Interior & Renovation",
    text: "Functional interior planning and renovation solutions that improve existing spaces without losing engineering discipline.",
    icon: "◫",
  },
  {
    number: "06",
    title: "Engineering Consultancy",
    text: "Project-specific architectural and engineering advice for design decisions, feasibility and technical coordination.",
    icon: "＋",
  },
];

const projects = [
  {
    code: "ARCHITECTURE",
    title: "Residential Design",
    text: "Efficient homes planned around daylight, circulation, privacy and buildable detailing.",
    className: "project-art-one",
  },
  {
    code: "ENGINEERING",
    title: "Structural Design",
    text: "Coordinated structural systems developed for safety, economy and construction practicality.",
    className: "project-art-two",
  },
  {
    code: "DELIVERY",
    title: "Site & Project Support",
    text: "Design-to-site coordination with supervision, documentation and professional follow-through.",
    className: "project-art-three",
  },
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

      <section className="public-hero">
        <div className="public-hero-grid" />
        <div className="public-hero-orbit public-hero-orbit-one" />
        <div className="public-hero-orbit public-hero-orbit-two" />

        <div className="public-container public-hero-inner">
          <div className="public-hero-copy">
            <span className="public-overline">ARCHITECTS & ENGINEERS</span>
            <div className="public-hero-tag">DESIGNED TO DELIVER</div>
            <h1>
              Architecture that works.
              <span> Engineering that lasts.</span>
            </h1>
            <p>
              LAND VIEW brings architectural design, structural engineering,
              planning and site supervision into one coordinated consultancy.
            </p>

            <div className="public-hero-actions">
              <a href="#services" className="public-btn public-btn-accent">
                Explore Services <span>→</span>
              </a>
              <a href="#contact" className="public-btn public-btn-outline">
                Start a Project
              </a>
            </div>
          </div>

          <aside className="public-hero-panel">
            <span className="public-panel-kicker">LAND VIEW</span>
            <strong>One team.</strong>
            <strong>One workflow.</strong>
            <small>Architecture • Structure • Supervision</small>
            <div className="public-panel-rule" />
            <p>
              From the first sketch to technical delivery, every stage is
              coordinated around buildability and clear communication.
            </p>
          </aside>
        </div>
      </section>

      <section className="public-quick-band" aria-label="LAND VIEW services overview">
        <div className="public-quick-label">
          <span className="public-quick-ring">LV</span>
          <div>
            <small>DISCOVER</small>
            <strong>What we do</strong>
          </div>
        </div>
        <div className="public-quick-links">
          <a href="#services">Architecture</a>
          <a href="#services">Structure</a>
          <a href="#services">Planning</a>
          <a href="#services">Supervision</a>
          <a href="#contact" className="dark">Get Consultation</a>
        </div>
      </section>

      <section className="public-section public-services" id="services">
        <div className="public-container">
          <div className="public-section-head">
            <div>
              <span className="public-section-kicker">OUR CAPABILITIES</span>
              <h2>Design and engineering under one roof.</h2>
            </div>
            <p>
              A coordinated service model reduces gaps between architectural
              intent, structural decisions and site execution.
            </p>
          </div>

          <div className="public-service-grid">
            {services.map((service) => (
              <article className="public-service-card" key={service.number}>
                <div className="public-service-top">
                  <span>{service.number}</span>
                  <b>{service.icon}</b>
                </div>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
                <a href="#contact">Discuss your project <span>→</span></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-about" id="about">
        <div className="public-about-technical" />
        <div className="public-container public-about-grid">
          <div className="public-about-copy">
            <span className="public-section-kicker light">ABOUT LAND VIEW</span>
            <h2>Built around clear thinking and practical delivery.</h2>
            <p>
              LAND VIEW Architects & Engineers approaches each project as one
              coordinated design problem—not separate architectural,
              structural and construction tasks.
            </p>
            <p>
              The result is a more direct path from concept to drawings to
              site, with technical decisions considered early and communicated
              clearly.
            </p>
            <a href="#contact" className="public-text-link">Work with LAND VIEW <span>→</span></a>
          </div>

          <div className="public-about-card">
            <span>OUR APPROACH</span>
            <div className="public-about-row">
              <b>01</b>
              <div><strong>Integrated</strong><small>Architecture and engineering coordinated together.</small></div>
            </div>
            <div className="public-about-row">
              <b>02</b>
              <div><strong>Practical</strong><small>Solutions shaped for real construction conditions.</small></div>
            </div>
            <div className="public-about-row">
              <b>03</b>
              <div><strong>Accountable</strong><small>Clear documentation and project follow-through.</small></div>
            </div>
          </div>
        </div>
      </section>

      <PublicTeamSection />

      <section className="public-section public-projects" id="projects">
        <div className="public-container">
          <div className="public-section-head">
            <div>
              <span className="public-section-kicker">FEATURED WORK</span>
              <h2>Designed for the way projects are actually built.</h2>
            </div>
            <p>
              This portfolio area is ready for your real project photographs,
              drawings and completed LAND VIEW work.
            </p>
          </div>

          <div className="public-project-grid">
            {projects.map((project) => (
              <article className="public-project-card" key={project.title}>
                <div className={`public-project-art ${project.className}`}>
                  <div className="public-project-lines" />
                  <span>{project.code}</span>
                </div>
                <div className="public-project-copy">
                  <h3>{project.title}</h3>
                  <p>{project.text}</p>
                  <span className="public-project-link">LAND VIEW PROJECTS →</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-process" id="process">
        <div className="public-container">
          <div className="public-section-head compact light-head">
            <div>
              <span className="public-section-kicker light">HOW WE WORK</span>
              <h2>A clear path from brief to delivery.</h2>
            </div>
          </div>

          <div className="public-process-grid">
            {process.map(([number, title, text]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-contact" id="contact">
        <div className="public-container public-contact-grid">
          <div className="public-contact-copy">
            <span className="public-section-kicker light">START A CONVERSATION</span>
            <h2>Planning a building or engineering project?</h2>
            <p>
              Tell us what you are planning. LAND VIEW can help you define the
              right architectural, structural and supervision scope.
            </p>
            <a href="mailto:landviewcivil@gmail.com" className="public-btn public-btn-white">
              Email LAND VIEW <span>→</span>
            </a>
          </div>

          <div className="public-contact-details">
            <div>
              <span>OFFICE</span>
              <strong>F. Rahman AC Market (2nd Floor)</strong>
              <p>S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</p>
              <a href="https://share.google/cTmtQarK6Oo6KY8Md" target="_blank" rel="noreferrer" className="public-map-link">View office on Google Maps <span>↗</span></a>
            </div>
            <div>
              <span>EMAIL</span>
              <a href="mailto:landviewcivil@gmail.com">landviewcivil@gmail.com</a>
            </div>
            <div className="public-contact-phones">
              <div>
                <span>ENGINEERING</span>
                <a href="tel:+8801408080400">+88 0140 8080 400</a>
              </div>
              <div>
                <span>ARCHITECTURE</span>
                <a href="tel:+8801902500400">+88 01902 500 400</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="public-footer">
        <div className="public-container public-footer-grid">
          <div className="public-footer-brand">
            <img src="/land-view-logo.png" alt="LAND VIEW" />
            <div>
              <strong>LAND VIEW</strong>
              <span>ARCHITECTS & ENGINEERS</span>
            </div>
          </div>

          <div className="public-footer-links">
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#projects">Projects</a>
            <a href="#team">Team</a>
            <a href="#contact">Contact</a>
          </div>

          <div className="public-footer-copy">
            <span>© 2026 LAND VIEW</span>
            <small>Architecture • Engineering • Supervision</small>
          </div>
        </div>
      </footer>
    </main>
  );
}
