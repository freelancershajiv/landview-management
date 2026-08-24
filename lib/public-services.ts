export type PublicService = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  intro: string;
  highlights: string[];
  deliverables: string[];
  keywords: string[];
  icon: string;
};

export const publicServices: PublicService[] = [
  {
    slug: "architectural-design",
    name: "Architectural Design",
    shortDescription: "Architectural planning, floor plans, elevations and coordinated drawing packages for residential and commercial buildings.",
    description: "LAND VIEW provides architectural design services in Feni and across Bangladesh, including building planning, floor plans, elevations and coordinated architectural drawing packages.",
    intro: "We develop practical architectural solutions around the site, client requirements, circulation, daylight, usability and the overall character of the building. Our aim is to create spaces that are functional, buildable and clearly documented for construction.",
    highlights: ["Residential and commercial building planning", "Floor plans and space planning", "Building elevations and facade development", "Architectural drawing coordination"],
    deliverables: ["Concept and planning drawings", "Floor plans", "Elevations", "Sections and architectural details", "Coordinated drawing package"],
    keywords: ["architectural design Feni", "architect in Feni", "building design Feni", "architectural consultant Bangladesh"],
    icon: "▥",
  },
  {
    slug: "structural-design",
    name: "Structural Design",
    shortDescription: "Structural analysis, reinforced-concrete design and detailing focused on safety, efficiency and practical construction.",
    description: "Structural design and engineering consultancy by LAND VIEW in Feni, Bangladesh, including structural analysis, reinforced-concrete design and construction detailing.",
    intro: "Our structural design work focuses on a clear load path, efficient member sizing and practical reinforced-concrete detailing. Architectural requirements and structural behavior are coordinated so the final design can be executed safely and efficiently on site.",
    highlights: ["Structural analysis and modeling", "Reinforced-concrete member design", "Foundation design coordination", "Construction-oriented structural detailing"],
    deliverables: ["Structural design basis", "Column, beam and slab design", "Foundation design", "Structural drawings", "Reinforcement detailing"],
    keywords: ["structural engineer Feni", "structural design Feni", "RCC design Bangladesh", "structural consultant Bangladesh"],
    icon: "⌗",
  },
  {
    slug: "3d-exterior-design",
    name: "3D Design - Exterior",
    shortDescription: "Exterior 3D modeling and visualization for building form, facade, materials and architectural presentation.",
    description: "Professional exterior 3D design and architectural visualization services from LAND VIEW for buildings in Feni and throughout Bangladesh.",
    intro: "Exterior visualization helps clients understand the building before construction begins. We translate architectural drawings into presentation-ready exterior views that communicate form, facade composition, material direction and the overall appearance of the project.",
    highlights: ["Building massing and exterior modeling", "Facade visualization", "Material and finish studies", "Presentation-ready exterior views"],
    deliverables: ["3D exterior model", "Facade views", "Material visualization", "Rendered exterior images"],
    keywords: ["3D exterior design Feni", "building rendering Bangladesh", "architectural visualization Feni", "exterior design Bangladesh"],
    icon: "◇",
  },
  {
    slug: "3d-interior-design",
    name: "3D Design - Interior",
    shortDescription: "Interior planning and 3D visualization for finishes, furniture concepts, spatial composition and presentation views.",
    description: "Interior 3D design and visualization services by LAND VIEW in Feni, Bangladesh for residential and commercial spaces.",
    intro: "Our interior visualization service communicates how a space can look and function before execution. The design considers layout, furniture, finishes, lighting intent and the relationship between architectural elements within the room.",
    highlights: ["Interior space planning", "Furniture and layout concepts", "Finish and material visualization", "Presentation-ready interior views"],
    deliverables: ["Interior layout concepts", "3D interior model", "Material direction", "Rendered interior images"],
    keywords: ["interior 3D design Feni", "interior visualization Bangladesh", "3D interior rendering Feni", "interior design Feni"],
    icon: "◫",
  },
  {
    slug: "electrical-design",
    name: "Electrical Design",
    shortDescription: "Electrical layouts for lighting, power points, distribution and coordinated building-service planning.",
    description: "Building electrical design services from LAND VIEW, including lighting, power and distribution layouts coordinated with architectural plans.",
    intro: "Electrical layouts are developed as part of a coordinated building design so lighting points, outlets, distribution and service routes work with the architectural spaces and other building systems.",
    highlights: ["Lighting point layouts", "Power outlet planning", "Distribution planning", "Coordination with architectural drawings"],
    deliverables: ["Lighting layout", "Power layout", "Distribution layout", "Electrical drawing package"],
    keywords: ["electrical design Feni", "building electrical layout Bangladesh", "electrical drawing Feni"],
    icon: "⚡",
  },
  {
    slug: "plumbing-design",
    name: "Plumbing Design",
    shortDescription: "Water-supply, sanitary and drainage layouts coordinated with architectural and structural design.",
    description: "Plumbing design services by LAND VIEW for water supply, sanitary and drainage systems in building projects in Feni and Bangladesh.",
    intro: "Plumbing layouts are coordinated with the architectural plan and structural system to reduce conflicts during construction and provide a clear basis for water supply, sanitary and drainage installation.",
    highlights: ["Water-supply planning", "Sanitary layouts", "Drainage layouts", "Building-service coordination"],
    deliverables: ["Water-supply layout", "Sanitary layout", "Drainage layout", "Coordinated plumbing drawings"],
    keywords: ["plumbing design Feni", "sanitary design Bangladesh", "building plumbing layout Feni"],
    icon: "≈",
  },
  {
    slug: "estimate-costing",
    name: "Estimate & Costing",
    shortDescription: "Quantity takeoff, BOQ preparation and project cost estimation for budgeting and construction planning.",
    description: "Construction estimate and costing services by LAND VIEW in Feni, including quantity takeoff, BOQ preparation and project cost estimation.",
    intro: "A structured estimate helps clients understand expected quantities and costs before and during construction. We prepare quantity-based cost information to support budgeting, comparison and project decisions.",
    highlights: ["Quantity takeoff", "BOQ preparation", "Construction cost estimation", "Budget planning support"],
    deliverables: ["Quantity takeoff", "Bill of quantities", "Cost summary", "Estimate documentation"],
    keywords: ["building estimate Feni", "construction costing Bangladesh", "BOQ preparation Feni", "quantity estimation Bangladesh"],
    icon: "∑",
  },
  {
    slug: "plan-approval",
    name: "Plan Approval",
    shortDescription: "Preparation and coordination of drawings and documents required for building plan approval processes.",
    description: "Building plan approval drawing and documentation support from LAND VIEW for projects in Feni, Bangladesh.",
    intro: "We prepare and coordinate the architectural and technical information needed for the applicable building plan approval process. Requirements vary by authority and project, so documentation is organized around the relevant submission needs.",
    highlights: ["Approval drawing preparation", "Document coordination", "Drawing review for submission", "Technical submission support"],
    deliverables: ["Approval drawing set", "Required drawing coordination", "Submission-ready technical documents"],
    keywords: ["building plan approval Feni", "plan approval drawing Bangladesh", "building approval consultant Feni"],
    icon: "✓",
  },
  {
    slug: "digital-survey",
    name: "Digital Survey",
    shortDescription: "Digital site and land survey support for accurate measurements, existing conditions and project planning.",
    description: "Digital land and site survey support by LAND VIEW in Feni, Bangladesh for building design and project planning.",
    intro: "Accurate site information is the foundation of reliable planning. Digital survey work provides measurements and existing-condition information that can be used for architectural planning, site coordination and project documentation.",
    highlights: ["Site measurement", "Land and existing-condition survey", "Survey data for design", "Planning support"],
    deliverables: ["Survey measurements", "Site information", "Survey drawing/data for design coordination"],
    keywords: ["digital survey Feni", "land survey Feni", "site survey Bangladesh", "digital land survey Bangladesh"],
    icon: "⌖",
  },
  {
    slug: "soil-test",
    name: "Soil Test",
    shortDescription: "Soil investigation and testing support for geotechnical information and appropriate foundation decisions.",
    description: "Soil testing and geotechnical investigation support through LAND VIEW for building projects in Feni and Bangladesh.",
    intro: "Foundation decisions should be based on appropriate subsurface information. We coordinate soil investigation and testing so the design team can use the available geotechnical information when selecting and designing the foundation system.",
    highlights: ["Soil investigation coordination", "SPT and subsurface information support", "Geotechnical reporting coordination", "Foundation design input"],
    deliverables: ["Soil investigation coordination", "Test/report documentation", "Geotechnical information for foundation planning"],
    keywords: ["soil test Feni", "SPT test Feni", "geotechnical investigation Bangladesh", "soil investigation Feni"],
    icon: "◉",
  },
];

export function getPublicService(slug: string) {
  return publicServices.find((service) => service.slug === slug) || null;
}
