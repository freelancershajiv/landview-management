# LAND VIEW Public Project Portfolio — Apps Script setup

The Next.js public portfolio is already wired to call `getPublicProjects` through `/api/public/projects`.

## Public project images

For a project that is already approved for public display, upload its 3D JPG/JPEG/PNG/WEBP images **directly into that project's root folder** under `LV - Project Files`.

Example:

```text
LV - Project Files/
  Running/
    LV-280 - Nurul Huda - Silonia - 7 Storied/
      front.jpg
      02.jpg
      03.jpg
      Documents/
      Invoices/
      3D Design - Exterior/
```

Image rules:

- `front.jpg`, `front.jpeg`, `front.png`, or `front.webp` is preferred as the public cover image.
- If there is no `front.*`, the first image in the project root folder alphabetically becomes the cover.
- All remaining root-folder images appear in the public project gallery.
- Existing images in `3D Design - Exterior` remain supported and are appended after root-folder images for backward compatibility.
- Only JPG, JPEG, PNG and WEBP image files are exposed. Documents and files inside other project subfolders are not published.
- Uploading an image does **not** publish a private project. The project must still have `Public_Display` / **Show on Website** enabled.
- The Apps Script makes only the selected public image files viewable by link so the website can render them.

## Apps Script activation

To activate the Apps Script side:

1. Add the repository file `PublicProjects.gs` to the same Google Apps Script project as `Code.gs`.
2. In `handleAction(action, params, method)` inside `Code.gs`, add:

```js
case "getPublicProjects":
  return getPublicProjects(params);
```

Place it near `getPublicTeam`.

3. In `authorizeActionRequest(action, params)`, change the public actions line from:

```js
const publicActions = ["health", "login", "getPublicTeam"];
```

to:

```js
const publicActions = ["health", "login", "getPublicTeam", "getPublicProjects"];
```

4. Run this function once from the Apps Script editor:

```js
initializePublicProjectPortfolio()
```

This creates these Projects sheet columns if missing:

- Public_Display
- Public_Project_Title
- Public_Description
- Project_Category
- Project_Area
- Number_of_Stories
- Public_Services
- Completion_Year
- Public_Display_Order

5. Deploy a new version of the Apps Script web app whenever `PublicProjects.gs` changes.

After deployment, edit a project in LAND VIEW Admin, fill the Public Portfolio section, set **Show on Website = Yes**, and save it. The project and its root-folder 3D images will then appear at `/projects` and on its project detail page.
