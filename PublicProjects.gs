/* LAND VIEW — PUBLIC PROJECT PORTFOLIO
 * Public project images are automatically sourced from each project's
 * "3D Design - Exterior" Google Drive folder.
 *
 * Naming rule:
 *   front.jpeg / front.jpg / front.png => cover image
 *   all other JPG/JPEG/PNG/WEBP files => gallery images
 *
 * If the exterior folder has no images, the existing Cover_Image_URL and
 * Gallery_Images sheet fields remain available as a fallback.
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

function isPublicProjectImageFile_(file) {
  const name = String(file.getName() || "").toLowerCase();
  const mime = String(file.getMimeType() || "").toLowerCase();

  return (
    mime.indexOf("image/") === 0 &&
    (/\.(jpe?g|png|webp)$/i.test(name) || /image\/(jpeg|jpg|png|webp)/i.test(mime))
  );
}

function projectDriveImageUrl_(file) {
  return "https://drive.google.com/file/d/" + file.getId() + "/view";
}

function makePublicProjectImageReadable_(file) {
  try {
    file.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch (error) {
    /* Some Google Workspace policies may block link sharing.
       The project response still contains the file URL so administrators
       can identify the affected file. */
  }
}

function getExteriorPublicImages_(project) {
  try {
    const rootFolder = getLandViewRootFolder();
    const projectFolder = findExistingProjectFolder(rootFolder, project);

    if (!projectFolder) {
      return { coverImageUrl: "", galleryImages: [] };
    }

    const folders = projectFolder.getFoldersByName("3D Design - Exterior");
    if (!folders.hasNext()) {
      return { coverImageUrl: "", galleryImages: [] };
    }

    const exteriorFolder = folders.next();
    const files = exteriorFolder.getFiles();
    const images = [];

    while (files.hasNext()) {
      const file = files.next();
      if (!isPublicProjectImageFile_(file)) continue;

      makePublicProjectImageReadable_(file);

      images.push({
        name: String(file.getName() || ""),
        lowerName: String(file.getName() || "").toLowerCase(),
        url: projectDriveImageUrl_(file),
        updated: file.getLastUpdated ? file.getLastUpdated().getTime() : 0
      });
    }

    if (!images.length) {
      return { coverImageUrl: "", galleryImages: [] };
    }

    images.sort(function(a, b) {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    const frontIndex = images.findIndex(function(image) {
      return /^front\.(jpe?g|png|webp)$/i.test(image.lowerName);
    });

    const cover = frontIndex >= 0 ? images[frontIndex] : images[0];
    const gallery = images
      .filter(function(image) { return image.url !== cover.url; })
      .map(function(image) { return image.url; });

    return {
      coverImageUrl: cover.url,
      galleryImages: gallery
    };

  } catch (error) {
    return { coverImageUrl: "", galleryImages: [] };
  }
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
      const exteriorImages = getExteriorPublicImages_(project);
      const manualCover = publicProjectImageUrl_(firstValue(project, ["Cover_Image_URL", "Cover Image URL", "Cover_Image", "Cover Image"]));
      const manualGallery = splitPublicList_(firstValue(project, ["Gallery_Images", "Gallery Images"]));

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
        coverImageUrl: exteriorImages.coverImageUrl || manualCover,
        galleryImages: exteriorImages.coverImageUrl ? exteriorImages.galleryImages : manualGallery,
        services: splitPublicList_(firstValue(project, ["Public_Services", "Public Services", "Services"])),
        displayOrder: Number(firstValue(project, ["Public_Display_Order", "Public Display Order"]) || 9999)
      };
    })
    .sort(function(a, b) {
      return a.displayOrder - b.displayOrder || String(a.title || "").localeCompare(String(b.title || ""));
    });

  return { success: true, data: publicRows };
}
