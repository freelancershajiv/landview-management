import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicHeader from "@/components/public-header";
import PublicServiceRelatedProjects from "@/components/public-service-related-projects";
import { getPublicService, publicServices } from "@/lib/public-services";
import { servicePlanning } from "@/lib/service-planning";
import { businessSchema } from "@/lib/site-info";
import "../services-v2.css";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publicServices.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getPublicService(slug);
  if (!service) return {};
  const url = `https://www.landview.com.bd/services/${service.slug}`;
  return {
    title: `${service.name} in Bangladesh`,
    description: service.description,
    keywords: service.keywords,
    alternates: { canonical: url },
    openGraph: { title: `${service.name} in Bangladesh | LAND VIEW`, description: service.description, url, siteName: "LAND VIEW Engineers & Architects", type: "article" },
    twitter: { card: "summary_large_image", title: `${service.name} in Bangladesh | LAND VIEW`, description: service.description },
    robots: { index: true, follow: true },
  };
}

export default async function ServicePage({ params }: PageProps) {
  const { slug } = await params;
  const service = getPublicService(slug);
  if (!service) notFound();

  const url = `https://www.landview.com.bd/services/${service.slug}`;
  const planning = servicePlanning[service.slug] || { prepare: "Share the project location, available drawings and the service scope you are considering.", questions: [], related: [] };
  const related = planning.related.map(getPublicService).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const whatsappMessage = `Hello LAND VIEW, I would like to discuss ${service.name}. Project location: ____. Project type: ____. Proposed floors: ____. Available drawings/site information: ____.`;
  const whatsappUrl = `https://wa.me/8801902500400?text=${encodeURIComponent(whatsappMessage)}`;

  const provider = businessSchema;
  const serviceSchema = { "@context": "https://schema.org", "@type": "Service", "@id": `${url}#service`, name: service.name, description: service.description, url, serviceType: service.name, areaServed: provider.areaServed, provider };
  const breadcrumbSchema = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://www.landview.com.bd" }, { "@type": "ListItem", position: 2, name: "Services", item: "https://www.landview.com.bd/services" }, { "@type": "ListItem", position: 3, name: service.name, item: url }] };
  const faqSchema = planning.questions.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: planning.questions.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) } : null;

  return (
    <main className="sv2-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {faqSchema ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} /> : null}
      <PublicHeader />

      <section className="sv2-detail-hero">
        <div className="sv2-wrap">
          <nav className="sv2-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><Link href="/services">Services</Link><span>›</span><span>{service.name}</span></nav>
          <div className="sv2-detail-grid">
            <div>
              <div className="sv2-service-icon" aria-hidden="true">{service.icon}</div>
              <h1>{service.name}<br />in Bangladesh</h1>
              <p>{service.description}</p>
              <div className="sv2-actions"><a className="sv2-btn sv2-btn-whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Discuss on WhatsApp</a><Link className="sv2-btn sv2-btn-outline" href="/projects">View Projects</Link></div>
            </div>
            <aside className="sv2-service-summary"><span>SERVICE OVERVIEW</span><strong>{service.name}</strong><p>Feni Sadar, Feni-3900 · Available for suitable projects in Feni and elsewhere in Bangladesh, subject to project scope and coordination requirements.</p></aside>
          </div>
        </div>
      </section>

      <section className="sv2-wrap sv2-detail-content">
        <div className="sv2-detail-main">
          <article className="sv2-panel">
            <span className="sv2-panel-label">WHAT THIS SERVICE DOES</span>
            <h2>{service.name} for building projects</h2>
            <p>{service.intro}</p>
            <div className="sv2-actions"><a className="sv2-btn sv2-btn-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Request Service Discussion</a><Link className="sv2-btn sv2-btn-outline" href="/contact">Contact Details</Link></div>
          </article>

          <div className="sv2-side-stack">
            <aside className="sv2-panel"><span className="sv2-panel-label">SERVICE FOCUS</span><h2>What we coordinate</h2><ul className="sv2-check-list">{service.highlights.map((item) => <li key={item}>{item}</li>)}</ul></aside>
            <aside className="sv2-panel"><span className="sv2-panel-label">LAND VIEW OFFICE</span><h2>Talk to the team</h2><div className="sv2-contact-list"><div><span>WhatsApp / Architecture</span><strong>+88 01902 500 400</strong></div><div><span>Engineering</span><strong>+88 0140 8080 400</strong></div><div><span>Office</span><strong>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar</strong></div></div></aside>
          </div>

          <article className="sv2-panel sv2-wide">
            <div className="sv2-prepare">
              <div><span className="sv2-panel-label">TYPICAL DELIVERABLES</span><h2>What may be included in the service package</h2><ul className="sv2-deliverables">{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><span className="sv2-panel-label">BEFORE YOU REQUEST A QUOTATION</span><h2>Prepare the right project information</h2><div className="sv2-prepare-note">{planning.prepare}</div></div>
            </div>
          </article>

          <section className="sv2-panel sv2-wide">
            <span className="sv2-panel-label">RELATED LAND VIEW WORK</span>
            <h2>Projects connected to {service.name.toLowerCase()}</h2>
            <p>These cards are loaded from LAND VIEW's current public project records when the service has been tagged on a published project.</p>
            <PublicServiceRelatedProjects serviceName={service.name} />
          </section>

          {planning.questions.length ? <section className="sv2-panel sv2-wide"><span className="sv2-panel-label">COMMON QUESTIONS</span><h2>Before you start {service.name.toLowerCase()}</h2><div className="sv2-faq">{planning.questions.map((item, index) => <details key={item.question} open={index === 0}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section> : null}

          {related.length ? <section className="sv2-panel sv2-wide"><span className="sv2-panel-label">RELATED SERVICES</span><h2>Services that often connect with this scope</h2><div className="sv2-related-services">{related.map((item) => <Link href={`/services/${item.slug}`} className="sv2-related-service" key={item.slug}><span>{item.icon} RELATED SERVICE</span><strong>{item.name} →</strong></Link>)}</div></section> : null}

          <section className="sv2-wide sv2-detail-cta"><div className="sv2-detail-cta-grid"><div><span className="sv2-kicker">START THE CONVERSATION</span><h2>Tell LAND VIEW what you are planning.</h2><p>For the fastest first discussion, send the project location, intended use, proposed floors, available drawings or site information and the service you need. WhatsApp enquiries go to 01902 500 400.</p></div><div className="sv2-actions"><a className="sv2-btn sv2-btn-whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp 01902 500 400</a><Link className="sv2-btn sv2-btn-outline" href="/services">All Services</Link></div></div></section>
        </div>
      </section>
    </main>
  );
}
