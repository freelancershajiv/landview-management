export const servicePlanning: Record<string, { prepare: string; questions: { question: string; answer: string }[]; related: string[] }> = {
  "architectural-design": {
    prepare: "Share your plot location and measurements, road access, intended building use, preferred number of floors, room requirements and budget. Existing survey drawings help the team understand the site before developing a layout.",
    questions: [
      { question: "What is included in an architectural design package?", answer: "The scope can include concept layouts, floor plans, elevations, sections and architectural details. Confirm the drawing list, revision stages and coordination with structural and building-services drawings in your proposal." },
      { question: "Can I start with a floor plan and add other design services later?", answer: "You can discuss a phased scope. Identifying structural, electrical and plumbing needs during planning helps avoid redesign when those drawings are developed." },
    ], related: ["structural-design", "3d-exterior-design", "plan-approval"],
  },
  "structural-design": {
    prepare: "Bring the architectural plans, intended building use and floor count, site location, available soil investigation report and any existing structural drawings. Mention future extensions at the briefing stage so they can be assessed as part of the design scope.",
    questions: [
      { question: "Does structural design include foundation drawings?", answer: "A structural package can include foundation, column, beam and slab drawings with reinforcement details. The agreed scope and available geotechnical information determine what can be completed and issued." },
      { question: "Can you review a building planned for additional floors?", answer: "Discuss an assessment before proceeding. Existing drawings, construction records, site observations and any necessary investigation are needed to establish an appropriate review scope; a proposed extension cannot be confirmed from a floor plan alone." },
    ], related: ["soil-test", "architectural-design", "site-supervision"],
  },
  "3d-exterior-design": {
    prepare: "Provide floor plans and elevations if available, photographs of the site, preferred facade references and the views you need. Identify whether the images are for design decisions, family discussion or project presentation.",
    questions: [
      { question: "Can I compare facade finishes before construction?", answer: "Exterior visualization can show alternative materials, colours and facade arrangements. Agree on the number of views and revision options before modelling begins." },
      { question: "Is a rendered image enough for construction?", answer: "A rendered image communicates appearance. Construction needs coordinated dimensions, details and technical drawings, which should be included separately in the agreed design scope." },
    ], related: ["architectural-design", "3d-interior-design", "estimate-costing"],
  },
  "3d-interior-design": {
    prepare: "Share room dimensions, photographs, furniture requirements, preferred materials and budget. Tell the team which rooms need visualization and whether existing furniture or finishes must be retained.",
    questions: [
      { question: "What can an interior visualization show?", answer: "It can communicate furniture layouts, finish combinations, lighting intent and the relationship between spaces. The proposal should identify the rooms, views and revisions included." },
      { question: "Are working drawings included with interior renders?", answer: "Confirm this when requesting a quotation. Presentation images and construction details serve different purposes; specify any layout, electrical, joinery or finish drawings needed for execution." },
    ], related: ["architectural-design", "electrical-design", "estimate-costing"],
  },
  "electrical-design": {
    prepare: "Provide the architectural layout, intended room uses and a list of major appliances or equipment. Include any planned lift, backup power or other service requirements for the team to review when defining the scope.",
    questions: [
      { question: "When should electrical planning start?", answer: "Discuss electrical requirements while room layouts are being coordinated. Equipment positions and service routes can affect architectural and other building-services drawings." },
      { question: "What drawings should I request?", answer: "Depending on the project, the package can include lighting, power and distribution layouts. Agree on the equipment information, drawing details and coordination responsibilities in the proposal." },
    ], related: ["architectural-design", "plumbing-design", "3d-interior-design"],
  },
  "plumbing-design": {
    prepare: "Share floor plans, bathroom and kitchen locations, intended building use and any information about water supply and drainage connections. Existing buildings also benefit from photographs and available service drawings.",
    questions: [
      { question: "What does a plumbing drawing package cover?", answer: "The scope can include water-supply, sanitary and drainage layouts coordinated with the building plans. Confirm the systems and drawing details required for your project." },
      { question: "Why coordinate plumbing with architectural and structural drawings?", answer: "Wet areas, service routes and access requirements need to be considered together. Early coordination helps identify conflicts before the drawings reach the construction team." },
    ], related: ["architectural-design", "structural-design", "electrical-design"],
  },
  "estimate-costing": {
    prepare: "Provide the latest drawings, material and finish specifications, site location and the work stages to be estimated. State whether you need an early budget, a detailed bill of quantities or a comparison of defined options.",
    questions: [
      { question: "How is a BOQ different from an initial budget?", answer: "A bill of quantities lists measured work items based on defined drawings and specifications. An early budget uses less detailed information and should be refined as the design develops." },
      { question: "Can the estimate change after drawings are revised?", answer: "Yes. Changes in quantities, specifications, construction scope and supplier rates can change the estimate. Keep the drawing revision and pricing assumptions with the cost document." },
    ], related: ["architectural-design", "structural-design", "site-supervision"],
  },
  "plan-approval": {
    prepare: "Share the project location, available site information and proposed drawings. The team can help identify which technical documents need preparation for the relevant authority and project scope.",
    questions: [
      { question: "Does preparing approval drawings guarantee approval?", answer: "No. LAND VIEW provides drawing and documentation support; the relevant authority reviews the submission and makes the approval decision." },
      { question: "Can the same submission package be used everywhere in Bangladesh?", answer: "Submission requirements depend on the location, authority and project. Confirm the applicable document list for your site before preparing a package." },
    ], related: ["architectural-design", "digital-survey", "structural-design"],
  },
  "digital-survey": {
    prepare: "Share the site location, access arrangements, available land records or previous surveys and the intended purpose of the measurement. Identify which site features the design team needs recorded.",
    questions: [
      { question: "What should I agree before a digital site survey?", answer: "Define the area to be measured, features to record and the drawing or data format required. Tell the team whether the information will support building planning, existing-condition records or another task." },
      { question: "Can a survey be coordinated with building design?", answer: "Yes. Discuss the information your architectural and engineering team needs before scheduling the survey, so the outputs can support the next design stage." },
    ], related: ["architectural-design", "plan-approval", "soil-test"],
  },
  "soil-test": {
    prepare: "Provide the site location, access information, proposed building use and available layout. Share any earlier investigation report so the design team can identify the geotechnical information needed for the project.",
    questions: [
      { question: "What is LAND VIEW's role in soil investigation?", answer: "LAND VIEW coordinates soil investigation and report documentation to support the design team. Confirm the investigation scope, testing arrangements and report deliverables before work begins." },
      { question: "Should I share an existing soil report?", answer: "Yes. Supply the complete report with the site and project information. The design team can review whether it provides the information needed for the proposed work." },
    ], related: ["structural-design", "digital-survey", "site-supervision"],
  },
  "site-supervision": {
    prepare: "Share the approved drawing set, project location, construction stage, contractor contact and upcoming work schedule. Specify whether you need scheduled visits, reporting or support with particular design-to-site questions.",
    questions: [
      { question: "Does site supervision mean an engineer is on site every day?", answer: "The attendance arrangement depends on the agreed service scope. Confirm visit frequency, notice periods, reporting and responsibilities; scheduled site visits should not be assumed to include full-time attendance." },
      { question: "What information can follow a site visit?", answer: "The agreed reporting scope may record observations, drawing-related questions, instructions and follow-up items. Provide the latest drawings so the visit relates to the current project information." },
    ], related: ["structural-design", "architectural-design", "estimate-costing"],
  },
};
