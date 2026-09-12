import type { Metadata } from "next";
import { jsonLd, siteUrl } from "@/lib/site-info";
import {
  getPublicProjectForSeo,
  normalizePublicImageUrl,
} from "@/lib/public-projects-server";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
};

function projectDescription(project: Awaited<ReturnType<typeof getPublicProjectForSeo>>) {
  if (!project) return "LAND VIEW Engineers & Architects project in Bangladesh.";

  const custom = String(project.description || "").trim();
  if (custom) return custom.slice(0, 158);

  const parts = [
    project.category,
    project.location,
    project.stories ? `${project.stories} stories` : "",
    project.area,
    project.services?.length ? project.services.slice(0, 2).join(" and ") : "",
  ].filter(Boolean);

  return `${project.title || "LAND VIEW project"} — ${parts.join(", ")}. Architecture and engineering consultancy by LAND VIEW.`.slice(0, 158);
}

function projectTitle(project: NonNullable<Awaited<ReturnType<typeof getPublicProjectForSeo>>>) {
  const name = String(project.title || project.projectId || "LAND VIEW Project").trim();
  const qualifier = [project.category, project.location ? `in ${project.location}` : ""].filter(Boolean).join(" ");
  const candidate = qualifier ? `${name} — ${qualifier} | LAND VIEW` : `${name} | LAND VIEW`;
  return candidate.length <= 68 ? candidate : `${name} | LAND VIEW Engineers & Architects`;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getPublicProjectForSeo(projectId);
  const id = decodeURIComponent(projectId);

  if (!project) {
    return {
      title: `Project ${id} | LAND VIEW Engineers & Architects`,
      description: "LAND VIEW Engineers & Architects project portfolio in Feni, Bangladesh.",
      robots: { index: false, follow: true },
    };
  }

  const title = projectTitle(project);
  const titleBase = String(project.title || project.projectId || "LAND VIEW Project").trim();
  const description = projectDescription(project);
  const canonical = `${siteUrl}/projects/${encodeURIComponent(String(project.projectId || id))}`;
  const cover = normalizePublicImageUrl(project.coverImageUrl);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "LAND VIEW Engineers & Architects",
      type: "article",
      locale: "en_BD",
      images: cover ? [{ url: cover, alt: `${titleBase}${project.location ? ` in ${project.location}` : ""} — LAND VIEW project` }] : undefined,
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      images: cover ? [cover] : undefined,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export default async function ProjectDetailLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;
  const project = await getPublicProjectForSeo(projectId);

  if (!project) return children;

  const id = String(project.projectId || decodeURIComponent(projectId));
  const title = String(project.title || id || "LAND VIEW Project");
  const canonical = `${siteUrl}/projects/${encodeURIComponent(id)}`;
  const cover = normalizePublicImageUrl(project.coverImageUrl);
  const gallery = (project.galleryImages || []).map(normalizePublicImageUrl).filter(Boolean);

  const projectSchema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${canonical}#project`,
    name: title,
    url: canonical,
    mainEntityOfPage: canonical,
    inLanguage: "en-BD",
    description: projectDescription(project),
    image: [cover, ...gallery].filter(Boolean),
    identifier: id,
    locationCreated: project.location
      ? {
          "@type": "Place",
          name: project.location,
          address: {
            "@type": "PostalAddress",
            addressCountry: "BD",
          },
        }
      : undefined,
    about: [project.category, ...(project.services || [])].filter(Boolean),
    keywords: [project.category, project.location, ...(project.services || [])].filter(Boolean).join(", ") || undefined,
    creator: { "@id": `${siteUrl}/#organization` },
    publisher: { "@id": `${siteUrl}/#organization` },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Projects", item: `${siteUrl}/projects` },
      { "@type": "ListItem", position: 3, name: title, item: canonical },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(projectSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {children}
    </>
  );
}
