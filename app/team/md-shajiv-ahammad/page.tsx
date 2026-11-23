import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { getPublicTeamForSeo, normalizePublicTeamImageUrl } from "@/lib/public-team-server";
import { DEVELOPER_NAME, DEVELOPER_PROFILE_PATH, DEVELOPER_PROFILE_URL } from "@/lib/developer-credit";
import { business, jsonLd, siteUrl } from "@/lib/site-info";
import "./profile.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arch Md Shajiv Ahammad | Architectural Designer & Website Developer",
  description: "Professional profile of Md Shajiv Ahammad, Architectural Designer & Consultant at LAND VIEW Engineers & Architects in Feni, Bangladesh, and credited website developer.",
  alternates: { canonical: DEVELOPER_PROFILE_PATH },
  openGraph: {
    type: "profile",
    url: DEVELOPER_PROFILE_URL,
    title: "Arch Md Shajiv Ahammad | LAND VIEW",
    description: "Professional biography, architecture work and website development attribution for Md Shajiv Ahammad.",
    siteName: business.name,
  },
  twitter: { card: "summary", title: "Arch Md Shajiv Ahammad | LAND VIEW" },
};

const clean = (value: unknown) => String(value ?? "").trim();

export default async function ShajivProfessionalPage() {
  // Only pull credentials, photo and external links from the employee's public listing.
  const team = await getPublicTeamForSeo();
  const person = team.find((member) => clean(member.name).toLowerCase() === "md shajiv ahammad");
  const image = person ? normalizePublicTeamImageUrl(person.photoUrl, "w1600") : "";
  const position = clean(person?.position || person?.designation || person?.title) || "Architectural Designer & Consultant";
  const publicDetails = clean(person?.bio).split(/\r?\n/)
    .map((item) => item.trim()).filter((item) => item && !item.startsWith("__POSITION__:"));
  const qualifications = publicDetails.filter((item) => /^(diploma|b\.?(sc|arch)|m\.?(sc|arch)|bachelor|master|phd)/i.test(item)).slice(0, 5);
  const affiliations = publicDetails.filter((item) => /^ideb\b|membership/i.test(item)).slice(0, 4);
  const personSchema = {
    "@context": "https://schema.org", "@type": "Person",
    "@id": DEVELOPER_PROFILE_URL + "#person",
    name: "Md Shajiv Ahammad", alternateName: DEVELOPER_NAME,
    url: DEVELOPER_PROFILE_URL, jobTitle: position,
    image: image || undefined,
    worksFor: { "@id": siteUrl + "/#organization" },
    alumniOf: qualifications.some((item) => /ICST/i.test(item)) ? { "@type": "EducationalOrganization", name: "Institute of Computer Science & Technology (ICST)" } : undefined,
    knowsAbout: ["Architectural design", "Building planning", "Design documentation", "Website development"],
    sameAs: person?.linkedInUrl ? [person.linkedInUrl] : undefined,
  };

  return <main className="shajiv-public-profile public-site" id="main-content">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(personSchema) }} />
    <PublicHeader />
    <div className="shajiv-profile-container">
      <nav className="shajiv-breadcrumb" aria-label="Breadcrumb"><Link href="/">LAND VIEW</Link><span>/</span><Link href="/team">Team</Link><span>/</span><span aria-current="page">Md Shajiv Ahammad</span></nav>
      <section className="shajiv-profile-hero" aria-labelledby="shajiv-title">
        <div className="shajiv-profile-summary">
          <span className="shajiv-eyebrow">LAND VIEW · ARCHITECTURE & DIGITAL WORK</span>
          <h1 id="shajiv-title">Arch Md <span>Shajiv Ahammad</span></h1>
          <p className="shajiv-role">{position}</p>
          <p className="shajiv-intro">An architectural design professional at LAND VIEW Engineers &amp; Architects in Feni, Bangladesh, working in architectural planning, drawing coordination and digital tools that support the firm’s project workflows.</p>
          <div className="shajiv-profile-chips"><span>Feni, Bangladesh</span><span>Architecture &amp; Design</span><span>LAND VIEW Website Developer</span></div>
          <div className="shajiv-contact-numbers" aria-label="Phone contact numbers">
            <a className="shajiv-contact-number" href="tel:+8801902500400" aria-label="Call official number +88 01902 500 400">
              <span className="shajiv-contact-label">Official</span>
              <strong>+88 01902 500 400</strong>
              <span className="shajiv-contact-action">Tap to call</span>
            </a>
            <a className="shajiv-contact-number" href="tel:+8801825301884" aria-label="Call personal number +88 01825 301 884">
              <span className="shajiv-contact-label">Personal</span>
              <strong>+88 01825 301 884</strong>
              <span className="shajiv-contact-action">Tap to call</span>
            </a>
          </div>
          <div className="shajiv-messaging">
            <div className="shajiv-messaging-heading"><span className="shajiv-contact-label">Connect your way</span><p>Available across major communication platforms. Prefer messaging? WhatsApp, Messenger, Telegram, Viber, imo, Signal and other apps are welcome.</p></div>
            <a href="https://wa.me/8801902500400" className="shajiv-messaging-whatsapp" target="_blank" rel="noopener noreferrer" aria-label="Message Shajiv using the official WhatsApp number">Message on WhatsApp ↗</a>
            <p className="shajiv-messaging-note">For other apps, request the preferred chat ID or link through the contact numbers above.</p>
          </div>
          <div className="shajiv-profile-actions"><Link className="shajiv-action-primary" href="/contact">Contact LAND VIEW</Link><Link className="shajiv-action-secondary" href="/team">Meet the Team</Link></div>
        </div>
        <div className="shajiv-portrait-area">
          {image ? <img src={image} alt="Md Shajiv Ahammad, architectural designer at LAND VIEW" width={600} height={730} className="shajiv-portrait" /> : <div className="shajiv-portrait-fallback" role="img" aria-label="Portrait unavailable"><span>MS</span></div>}
          <div className="shajiv-portrait-caption"><span>ARCHITECTURAL DESIGN</span><strong>LAND VIEW · FENI</strong></div>
        </div>
      </section>

      <section className="shajiv-section" aria-labelledby="shajiv-about">
        <div className="shajiv-section-heading"><span>01 / ABOUT</span><h2 id="shajiv-about">Professional profile</h2></div>
        <div className="shajiv-section-content">
          <p>Md Shajiv Ahammad is publicly listed as an Architectural Designer &amp; Consultant with LAND VIEW. His work connects building-planning needs with practical architectural documentation and the wider engineering consultancy process.</p>
          <p>He is also credited for developing the LAND VIEW website, which connects public project information with the organization’s digital systems and services.</p>
        </div>
      </section>

      <section className="shajiv-section" aria-labelledby="shajiv-expertise">
        <div className="shajiv-section-heading"><span>02 / FOCUS</span><h2 id="shajiv-expertise">Areas of work</h2></div>
        <div className="shajiv-expertise-grid">
          <article><span>01</span><h3>Architectural planning</h3><p>Floor-plan development, space planning and building design documentation.</p></article>
          <article><span>02</span><h3>Design coordination</h3><p>Coordinating drawings and project information across architectural and engineering services.</p></article>
          <article><span>03</span><h3>Digital workflows</h3><p>Website development and digital tools that improve access to project information and organizational processes.</p></article>
        </div>
      </section>

      {(qualifications.length > 0 || affiliations.length > 0) && <section className="shajiv-section" aria-labelledby="shajiv-credentials">
        <div className="shajiv-section-heading"><span>03 / BACKGROUND</span><h2 id="shajiv-credentials">Public qualifications &amp; affiliations</h2></div>
        <div className="shajiv-section-content">
          {qualifications.length > 0 && <div className="shajiv-detail-block"><h3>Education</h3>{qualifications.map((item) => <p key={item}>{item}</p>)}</div>}
          {affiliations.length > 0 && <div className="shajiv-detail-block"><h3>Professional affiliation</h3>{affiliations.map((item) => <p key={item}>{item}</p>)}</div>}
          <small>Professional details and photographs are drawn from LAND VIEW’s publicly maintained team listing.</small>
        </div>
      </section>}

      <section className="shajiv-profile-cta">
        <div><span>LET’S CONNECT</span><h2>Discuss an architecture or building project.</h2><p>For consultancy enquiries, use LAND VIEW’s published office contact details.</p></div>
        <div className="shajiv-cta-links"><Link href="/contact">Contact the Office</Link><Link href="/projects">Explore LAND VIEW Projects</Link>{person?.linkedInUrl ? <a href={person.linkedInUrl} rel="noopener noreferrer" target="_blank">Professional LinkedIn</a> : null}</div>
      </section>
    </div>
  </main>;
}
