import type { Metadata } from "next";
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
  if (custom) return custom.slice(0, 155);

  const parts = [
    project.category,
    project.location,
    project.stories ? `${project.stories} stories` : "",
    project.area,
  ].filter(Boolean);

  return `${project.title || "LAND VIEW project"} — ${parts.join(", ")}. Designed by LAND VIEW Engineers & Architects.`.slice(0, 155);
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

  const titleBase = String(project.title || project.projectId || "LAND VIEW Project").trim();
  const title = `${titleBase} | LAND VIEW Engineers & Architects`;
  const description = projectDescription(project);
  const canonical = `https://landview.com.bd/projects/${encodeURIComponent(String(project.projectId || id))}`;
  const cover = normalizePublicImageUrl(project.coverImageUrl);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "LAND VIEW Engineers & Architects",
      type: "article",
      images: cover ? [{ url: cover, alt: `${titleBase} by LAND VIEW Engineers & Architects` }] : undefined,
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
  const canonical = `https://landview.com.bd/projects/${encodeURIComponent(id)}`;
  const cover = normalizePublicImageUrl(project.coverImageUrl);
  const gallery = (project.galleryImages || []).map(normalizePublicImageUrl).filter(Boolean);

  const projectSchema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: title,
    url: canonical,
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
    dateCreated: project.completionYear ? String(project.completionYear) : undefined,
    about: [project.category, ...(project.services || [])].filter(Boolean),
    creator: {
      "@type": "ProfessionalService",
      name: "LAND VIEW Engineers & Architects",
      url: "https://landview.com.bd",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Feni",
        addressRegion: "Chattogram",
        addressCountry: "BD",
      },
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://landview.com.bd",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Projects",
        item: "https://landview.com.bd/projects",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: canonical,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(projectSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}
