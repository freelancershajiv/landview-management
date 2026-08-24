/* LAND VIEW — PUBLIC PROJECT PORTFOLIO
 * Add this file to the Apps Script project, then register getPublicProjects
 * in Code.gs as described in PUBLIC_PROJECTS_SETUP.md.
 */

function ensureProjectPublicHeaders_() {
  return ensureHeaders_(getSheet(CONFIG.SHEETS.PROJECTS), [
    "Public_Display",
    "Public_Project_Title",
    "Public_Description",
    "Project_Category",
    "Project_Area",
    "Number_of_Stories",
    "Cover_Image_URL",
    "Gallery_Images",
    "Public_Services",
    "Completion_Year",
    "Public_Display_Order"
  ]);
}

function initializePublicProjectPortfolio() {
  const headers = ensureProjectPublicHeaders_();
  return {
    success: true,
    data: {
      initialized: true,
      headers: headers
    }
  };
}

function splitPublicList_(value) {
  return String(value || "")
    .split(/\r?\n|\s*[•|]\s*/)
    .map(function(item) { return String(item || "").trim(); })
    .filter(Boolean);
}

function publicProjectImageUrl_(value) {
  return String(value || "").trim();
}

function getPublicProjects(params) {
  ensureProjectPublicHeaders_();

  const rows = readSheet(CONFIG.SHEETS.PROJECTS);

  const publicRows = rows
    .filter(function(project) {
      const visible = normalize(firstValue(project, ["Public_Display", "Public Display", "Show_Publicly", "Show Publicly"]));
      return visible === "true" || visible === "yes" || visible === "1";
    })
    .map(function(project) {
      return {
        projectId: firstValue(project, ["Project_ID", "Project ID", "ProjectId"]),
        title: firstValue(project, ["Public_Project_Title", "Public Project Title", "Project_Name", "Project Name", "Name"]),
        category: firstValue(project, ["Project_Category", "Project Category", "Project_Type", "Project Type"]),
        location: firstValue(project, ["Location", "Project_Location", "Project Location"]),
        status: firstValue(project, ["Status", "status"]),
        area: firstValue(project, ["Project_Area", "Project Area", "Land_Area", "Land Area"]),
        stories: firstValue(project, ["Number_of_Stories", "Number of Stories", "Floor_Story", "Floor/Story", "Floors"]),
        completionYear: firstValue(project, ["Completion_Year", "Completion Year"]),
        description: firstValue(project, ["Public_Description", "Public Description"]),
        coverImageUrl: publicProjectImageUrl_(firstValue(project, ["Cover_Image_URL", "Cover Image URL", "Cover_Image", "Cover Image"])),
        galleryImages: splitPublicList_(firstValue(project, ["Gallery_Images", "Gallery Images"])),
        services: splitPublicList_(firstValue(project, ["Public_Services", "Public Services", "Services"])),
        displayOrder: Number(firstValue(project, ["Public_Display_Order", "Public Display Order"]) || 9999)
      };
    })
    .sort(function(a, b) {
      return a.displayOrder - b.displayOrder || String(a.title || "").localeCompare(String(b.title || ""));
    });

  return { success: true, data: publicRows };
}
