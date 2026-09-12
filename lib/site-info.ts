export const siteUrl = "https://www.landview.com.bd";
export const business = {
  name: "LAND VIEW Engineers & Architects",
  email: "landviewcivil@gmail.com",
  telephone: "+8801408080400",
  architecturePhone: "+8801902500400",
  mapUrl: "https://maps.app.goo.gl/oCLmqzJFdiDbngu36",
  address: {
    "@type": "PostalAddress",
    streetAddress: "F. Rahman AC Market (2nd Floor), S.S.K Road",
    addressLocality: "Feni Sadar",
    addressRegion: "Feni",
    postalCode: "3900",
    addressCountry: "BD",
  },
};

export const businessSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${siteUrl}/#organization`,
  name: business.name,
  url: siteUrl,
  logo: `${siteUrl}/land-view-logo.png`,
  image: `${siteUrl}/land-view-logo.png`,
  email: business.email,
  telephone: business.telephone,
  address: business.address,
  hasMap: business.mapUrl,
  description: "Engineering and architectural consultancy based in Feni, Bangladesh, providing building design, structural design, site supervision and coordinated technical services.",
  areaServed: { "@type": "Country", name: "Bangladesh" },
  contactPoint: [
    { "@type": "ContactPoint", contactType: "Engineering enquiries", telephone: business.telephone },
    { "@type": "ContactPoint", contactType: "Architecture enquiries", telephone: business.architecturePhone },
  ],
};

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
