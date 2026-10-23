import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { publicServices, type PublicService } from "@/lib/public-services";
import "./services-v2.css";

export const metadata: Metadata = {
  title: "Architecture, Engineering & Building Consultancy Services | LAND VIEW",
  description: "Explore LAND VIEW architecture, structural engineering, 3D visualization, building services, costing, approval support, survey, soil investigation and site supervision services in Feni and across Bangladesh.",
  keywords: ["architect in Feni", "structural engineer Feni", "building design Feni", "engineering consultant Feni", "architectural design Feni", "plan approval Feni", "soil test Feni", "digital survey Feni"],
  alternates: { canonical: "https://www.landview.com.bd/services" },
  openGraph: { title: "Architecture & Engineering Services | LAND VIEW", description: "Coordinated building consultancy from design and engineering through approval support and construction-stage services.", url: "https://www.landview.com.bd/services", siteName: "LAND VIEW Engineers & Architects", type: "website" },
  twitter: { card: "summary_large_image", title: "Architecture & Engineering Services | LAND VIEW", description: "Explore LAND VIEW building design and engineering services in Bangladesh." },
  robots: { index: true, follow: true },
};

type Group = { label: string; title: string; description: string; slugs: string[] };

const groups: Group[] = [
  {
    label: "01 / DESIGN & ENGINEERING",
    title: "Develop the building as one coordinated design.",
    description: "Architecture, structure, visualization and building services are easier to execute when the major technical decisions are considered together.",
    slugs: ["architectural-design", "structural-design", "3d-exterior-design", "3d-interior-design", "electrical-design", "plumbing-design"],
  },
  {
    label: "02 / PLANNING & PRE-CONSTRUCTION",
    title: "Prepare the information needed before construction.",
    description: "Costing, approval documentation, survey and soil investigation support help turn the design into a more informed and buildable project package.",
    slugs: ["estimate-costing", "plan-approval", "digital-survey", "soil-test"],
  },
  {
    label: "03 / PROJECT DELIVERY",
    title: "Keep design information connected to the site.",
    description: "Construction-stage support helps the client and project team connect current drawings, observations and site decisions during execution.",
    slugs: ["site-supervision"],
  },
];

const process = [
  ["01", "Define the scope", "Share the location, intended building use, floor count, available site information and the services you need."],
  ["02", "Coordinate the design", "Architectural and technical disciplines are developed around the agreed project scope and available information."],
  ["03", "Prepare documents", "Drawings, technical information, costing or approval documentation are prepared according to the selected services."],
  ["04", "Support delivery", "Where included, LAND VIEW continues with site observations, coordination and construction-stage follow-through."],
] as const;

function servicesFor(group: Group) {
  return group.slugs.map((slug) => publicServices.find((service) => service.slug === slug)).filter(Boolean) as PublicService[];
}

const whatsappMessage = "Hello LAND VIEW, I would like to discuss a building project. Project location: ____. Project type: ____. Proposed floors: ____. Services needed: ____.";
const whatsappUrl = `https://wa.me/8801902500400?text=${encodeURIComponent(whatsappMessage)}`;

export default function ServicesPage() {
  const schema = { "@context": "https://schema.org", "@type": "ItemList", name: "LAND VIEW architecture and engineering services", itemListElement: publicServices.map((service, index) => ({ "@type": "ListItem", position: index + 1, name: service.name, url: `https://www.landview.com.bd/services/${service.slug}` })) };
  const businessSchema = { "@context": "https://schema.org", "@type": "ProfessionalService", "@id": "https://www.landview.com.bd/#organization", name: "LAND VIEW Engineers & Architects", url: "https://www.landview.com.bd", email: "landviewcivil@gmail.com", telephone: "+8801408080400", address: { "@type": "PostalAddress", streetAddress: "F. Rahman AC Market (2nd Floor), S.S.K Road", addressLocality: "Feni Sadar", addressRegion: "Feni", postalCode: "3900", addressCountry: "BD" }, areaServed: [{ "@type": "City", name: "Feni" }, { "@type": "Country", name: "Bangladesh" }] };

  return (
    <main className="sv2-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }} />
      <PublicHeader />

      <section className="sv2-hero">
        <div className="sv2-wrap sv2-hero-grid">
          <div>
            <span className="sv2-kicker">LAND VIEW SERVICES · FENI, BANGLADESH</span>
            <h1>From first concept to<em>construction support.</em></h1>
            <p>LAND VIEW Engineers &amp; Architects provides coordinated architectural, structural and technical building consultancy for residential, commercial and other suitable projects. Choose individual services or discuss a coordinated scope for the full project journey.</p>
            <div className="sv2-actions"><a className="sv2-btn sv2-btn-whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp Project Enquiry</a><Link className="sv2-btn sv2-btn-outline" href="/projects">Explore Projects</Link></div>
          </div>
          <aside className="sv2-hero-card">
            <span>ONE COORDINATED CONSULTANCY</span>
            <div className="sv2-journey"><div><b>Design</b><span>Architecture, structure, visualization &amp; building services</span></div><div><b>Prepare</b><span>Costing, approval, survey &amp; soil information</span></div><div><b>Deliver</b><span>Site supervision &amp; design-to-site support</span></div></div>
          </aside>
        </div>
      </section>

      <section className="sv2-proof">
        <div className="sv2-wrap sv2-proof-grid">
          <div className="sv2-proof-copy"><strong>Based in Feni. Working across suitable projects in Bangladesh.</strong><span>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900.</span></div>
          <div className="sv2-proof-stat"><strong>{publicServices.length}</strong><span>Public services</span></div>
          <div className="sv2-proof-stat"><strong>3</strong><span>Service stages</span></div>
          <div className="sv2-proof-stat"><strong>1</strong><span>Coordinated team</span></div>
        </div>
      </section>

      <section className="sv2-section">
        <div className="sv2-wrap">
          <div className="sv2-heading"><div><span className="sv2-kicker">SERVICE DIRECTORY</span><h2>Choose the support your project actually needs.</h2></div><p>Each service page explains the focus, typical deliverables, what to prepare before requesting a quotation, common questions and related LAND VIEW services.</p></div>
          <div className="sv2-groups">
            {groups.map((group) => <section className="sv2-group" key={group.label}>
              <div className="sv2-group-head"><span>{group.label}</span><h3>{group.title}</h3><p>{group.description}</p></div>
              <div className="sv2-cards">{servicesFor(group).map((service, index) => <Link href={`/services/${service.slug}`} className="sv2-card" key={service.slug}><div className="sv2-card-top"><span className="sv2-card-icon" aria-hidden="true">{service.icon}</span><span className="sv2-card-index">{String(index + 1).padStart(2, "0")}</span></div><h4>{service.name}</h4><p>{service.shortDescription}</p><span className="sv2-card-link">Explore service →</span></Link>)}</div>
            </section>)}
          </div>
        </div>
      </section>

      <section className="sv2-section sv2-section-alt">
        <div className="sv2-wrap">
          <div className="sv2-heading"><div><span className="sv2-kicker">HOW TO START</span><h2>A practical path to the right service scope.</h2></div><p>You do not need to know every technical deliverable before contacting LAND VIEW. Start with the project information you have and the team can help define the next steps.</p></div>
          <div className="sv2-process-grid">{process.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
        </div>
      </section>

      <section className="sv2-cta-band">
        <div className="sv2-wrap sv2-cta-grid"><div><span className="sv2-kicker">PLANNING A BUILDING?</span><h2>Send your project details directly to LAND VIEW.</h2><p>Include the project location, land or site information, intended use, proposed floors and the services you are considering. WhatsApp enquiries go to 01902 500 400.</p></div><div className="sv2-actions"><a className="sv2-btn sv2-btn-whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp 01902 500 400</a><Link className="sv2-btn sv2-btn-outline" href="/contact">Full Contact Details</Link></div></div>
      </section>
    </main>
  );
}
