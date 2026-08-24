# LAND VIEW Public Project Portfolio — Apps Script setup

The Next.js public portfolio is already wired to call `getPublicProjects` through `/api/public/projects`.

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
- Cover_Image_URL
- Gallery_Images
- Public_Services
- Completion_Year
- Public_Display_Order

5. Deploy a new version of the Apps Script web app.

After deployment, edit a project in LAND VIEW Admin, fill the Public Portfolio section, set **Show on Website = Yes**, and save it. It will then appear at `/projects`.
