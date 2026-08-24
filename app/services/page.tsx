import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { publicServices } from "@/lib/public-services";

export const metadata: Metadata = {
  title: "Architecture & Engineering Services | LAND VIEW Feni",
  description:
    "Explore LAND VIEW Engineers & Architects services in Feni, Bangladesh: architectural design, structural design, 3D exterior and interior design, electrical, plumbing, costing, plan approval, digital survey and soil test.",
  alternates: { canonical: "https://landview.com.bd/services" },
  openGraph: {
    title: "Architecture & Engineering Services | LAND VIEW Feni",
    description:
      "Architectural, structural and technical building design services by LAND VIEW Engineers & Architects in Feni, Bangladesh.",
    url: "https://landview.com.bd/services",
    siteName: "LAND VIEW Engineers & Architects",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Architecture & Engineering Services | LAND VIEW Feni",
    description:
      "Explore LAND VIEW building design and engineering services in Feni, Bangladesh.",
  },
};

const css = `
  .lv-services-page{min-height:100vh;background:#07101a;color:#fff}.lv-services-wrap{width:min(100% - 44px,1320px);margin:0 auto}.lv-services-hero{padding:86px 0 56px;border-bottom:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 75% 20%,rgba(215,154,23,.12),transparent 30%),#07101a}.lv-services-kicker{display:block;margin-bottom:16px;color:#d79a17;font-size:10px;font-weight:900;letter-spacing:.2em}.lv-services-hero h1{max-width:900px;margin:0;font:500 clamp(42px,6vw,76px)/.98 Georgia,"Times New Roman",serif;letter-spacing:-.04em}.lv-services-hero p{max-width:760px;margin:24px 0 0;color:#cfd6dc;font-size:15px;line-height:1.8}.lv-service-list{padding:56px 0 80px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.lv-service-card{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;padding:26px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0d1721;color:#fff;transition:.2s ease}.lv-service-card:hover{transform:translateY(-3px);border-color:rgba(215,154,23,.65);background:#101d29}.lv-service-card-icon{width:50px;height:50px;display:grid;place-items:center;border:1px solid rgba(215,154,23,.45);border-radius:10px;color:#efb733;font-size:21px}.lv-service-card small{display:block;margin-bottom:6px;color:#8d9aa5;font-size:8px;font-weight:900;letter-spacing:.15em}.lv-service-card h2{margin:0 0 8px;font-size:20px}.lv-service-card p{margin:0;color:#bdc6cd;font-size:12px;line-height:1.7}.lv-service-arrow{color:#d79a17;font-size:20px}@media(max-width:760px){.lv-service-list{grid-template-columns:1fr}.lv-service-card{grid-template-columns:auto 1fr}.lv-service-arrow{display:none}.lv-services-hero{padding-top:60px}}
`;

export default function ServicesPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "LAND VIEW Engineers & Architects Services",
    itemListElement: publicServices.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: service.name,
      url: `https://landview.com.bd/services/${service.slug}`,
    })),
  };

  return (
    <main className="lv-services-page">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <PublicHeader />
      <section className="lv-services-hero">
        <div className="lv-services-wrap">
          <span className="lv-services-kicker">WHAT WE DO</span>
          <h1>Architecture, engineering and technical services for better buildings.</h1>
          <p>
            LAND VIEW Engineers &amp; Architects provides coordinated building design and technical consultancy services from Feni, Bangladesh. Explore each service below for details, typical deliverables and project scope.
          </p>
        </div>
      </section>
      <section className="lv-services-wrap lv-service-list" aria-label="LAND VIEW services">
        {publicServices.map((service, index) => (
          <Link href={`/services/${service.slug}`} className="lv-service-card" key={service.slug}>
            <span className="lv-service-card-icon" aria-hidden="true">{service.icon}</span>
            <div>
              <small>SERVICE {String(index + 1).padStart(2, "0")}</small>
              <h2>{service.name}</h2>
              <p>{service.shortDescription}</p>
            </div>
            <span className="lv-service-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
