import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicHeader from "@/components/public-header";
import { getPublicService, publicServices } from "@/lib/public-services";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publicServices.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getPublicService(slug);
  if (!service) return {};
  const url = `https://landview.com.bd/services/${service.slug}`;

  return {
    title: `${service.name} in Feni | LAND VIEW Engineers & Architects`,
    description: service.description,
    keywords: service.keywords,
    alternates: { canonical: url },
    openGraph: { title: `${service.name} in Feni | LAND VIEW`, description: service.description, url, siteName: "LAND VIEW Engineers & Architects", type: "article" },
    twitter: { card: "summary_large_image", title: `${service.name} in Feni | LAND VIEW`, description: service.description },
    robots: { index: true, follow: true },
  };
}

const css = `
.lv-service-page{min-height:100vh;background:#07101a;color:#fff}.lv-service-wrap{width:min(100% - 44px,1160px);margin:0 auto}.lv-service-hero{padding:72px 0 46px;background:radial-gradient(circle at 78% 18%,rgba(215,154,23,.13),transparent 28%),#07101a;border-bottom:1px solid rgba(255,255,255,.1)}.lv-service-back{display:inline-flex;margin-bottom:26px;color:#d79a17;font-size:10px;font-weight:900;letter-spacing:.08em}.lv-service-icon{width:64px;height:64px;display:grid;place-items:center;margin-bottom:20px;border:1px solid rgba(215,154,23,.45);border-radius:12px;color:#efb733;font-size:26px}.lv-service-hero h1{max-width:900px;margin:0;font:500 clamp(44px,6vw,76px)/.98 Georgia,"Times New Roman",serif;letter-spacing:-.04em}.lv-service-hero p{max-width:780px;margin:24px 0 0;color:#cfd6dc;font-size:15px;line-height:1.8}.lv-local-line{margin-top:16px!important;color:#efb733!important;font-size:11px!important;font-weight:800;letter-spacing:.03em}.lv-service-content{display:grid;grid-template-columns:1.25fr .75fr;gap:34px;padding:50px 0 78px}.lv-service-panel{padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0d1721}.lv-service-panel h2{margin:0 0 16px;font:500 30px/1.1 Georgia,"Times New Roman",serif}.lv-service-panel p{margin:0;color:#c5cdd4;font-size:13px;line-height:1.9}.lv-service-panel ul{margin:18px 0 0;padding:0;list-style:none}.lv-service-panel li{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);color:#d8dde2;font-size:12px;line-height:1.55}.lv-service-panel li:last-child{border-bottom:0}.lv-service-cta{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}.lv-service-btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:6px;font-size:9px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.lv-service-btn-gold{background:#d79a17;color:#111820}.lv-service-btn-outline{border:1px solid rgba(215,154,23,.72);color:#fff}.lv-service-related{grid-column:1/-1}.lv-related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.lv-related-card{padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#0b151f;color:#fff}.lv-related-card small{display:block;margin-bottom:7px;color:#d79a17;font-size:8px;font-weight:900;letter-spacing:.12em}.lv-related-card strong{font-size:14px}.lv-contact-facts{margin-top:18px!important}.lv-contact-facts li strong{display:block;color:#efb733;font-size:9px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}@media(max-width:780px){.lv-service-content{grid-template-columns:1fr}.lv-related-grid{grid-template-columns:1fr}.lv-service-hero{padding-top:54px}}
`;

export default async function ServicePage({ params }: PageProps) {
  const { slug } = await params;
  const service = getPublicService(slug);
  if (!service) notFound();
  const url = `https://landview.com.bd/services/${service.slug}`;
  const provider = {
    "@type": "ProfessionalService",
    "@id": "https://landview.com.bd/#organization",
    name: "LAND VIEW Engineers & Architects",
    url: "https://landview.com.bd",
    email: "landviewcivil@gmail.com",
    telephone: "+8801408080400",
    address: { "@type": "PostalAddress", streetAddress: "F. Rahman AC Market (2nd Floor), S.S.K Road", addressLocality: "Feni Sadar", addressRegion: "Feni", postalCode: "3900", addressCountry: "BD" },
    areaServed: [{ "@type": "City", name: "Feni" }, { "@type": "Country", name: "Bangladesh" }],
  };
  const serviceSchema = { "@context": "https://schema.org", "@type": "Service", "@id": `${url}#service`, name: service.name, description: service.description, url, serviceType: service.name, areaServed: provider.areaServed, provider };
  const breadcrumbSchema = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://landview.com.bd" }, { "@type": "ListItem", position: 2, name: "Services", item: "https://landview.com.bd/services" }, { "@type": "ListItem", position: 3, name: service.name, item: url }] };
  const related = publicServices.filter((item) => item.slug !== service.slug).slice(0, 3);

  return (
    <main className="lv-service-page">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <PublicHeader />
      <section className="lv-service-hero"><div className="lv-service-wrap">
        <Link className="lv-service-back" href="/services">← ALL SERVICES</Link><div className="lv-service-icon" aria-hidden="true">{service.icon}</div>
        <h1>{service.name} in Feni</h1><p>{service.description}</p><p className="lv-local-line">Feni Sadar, Feni-3900 · Serving suitable projects across Bangladesh</p>
      </div></section>
      <section className="lv-service-wrap lv-service-content">
        <article className="lv-service-panel"><h2>{service.name} for building projects</h2><p>{service.intro}</p><div className="lv-service-cta"><a href="/#contact" className="lv-service-btn lv-service-btn-gold">Discuss your project</a><Link href="/projects" className="lv-service-btn lv-service-btn-outline">View relevant projects</Link></div></article>
        <aside className="lv-service-panel"><h2>Service focus</h2><ul>{service.highlights.map((item) => <li key={item}>{item}</li>)}</ul></aside>
        <article className="lv-service-panel"><h2>Typical deliverables</h2><ul>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></article>
        <aside className="lv-service-panel"><h2>Local consultancy in Feni</h2><p>LAND VIEW Engineers &amp; Architects provides {service.name.toLowerCase()} support from Feni Sadar. Our architecture and engineering teams coordinate suitable building projects in Feni and other parts of Bangladesh.</p><ul className="lv-contact-facts"><li><strong>Office</strong>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900</li><li><strong>Engineering</strong>+88 0140 8080 400</li><li><strong>Architecture</strong>+88 01902 500 400</li></ul></aside>
        <section className="lv-service-panel lv-service-related"><h2>Related architecture &amp; engineering services</h2><div className="lv-related-grid">{related.map((item) => <Link href={`/services/${item.slug}`} className="lv-related-card" key={item.slug}><small>{item.icon} FENI SERVICE</small><strong>{item.name} →</strong></Link>)}</div><div className="lv-service-cta"><Link href="/services" className="lv-service-btn lv-service-btn-outline">All services</Link><Link href="/projects" className="lv-service-btn lv-service-btn-outline">LAND VIEW projects</Link><a href="/#contact" className="lv-service-btn lv-service-btn-gold">Contact LAND VIEW</a></div></section>
      </section>
    </main>
  );
}
