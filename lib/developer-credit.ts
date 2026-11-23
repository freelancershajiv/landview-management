/** Public profile and attribution shared by site, print and PDF exports. */
export const DEVELOPER_NAME = "Arch Md Shajiv Ahammad";
export const DEVELOPER_PROFILE_PATH = "/team/md-shajiv-ahammad";
export const DEVELOPER_PROFILE_URL = "https://www.landview.com.bd" + DEVELOPER_PROFILE_PATH;
export const DEVELOPER_PROFILE_PRINT_URL = "landview.com.bd" + DEVELOPER_PROFILE_PATH;
export const DEVELOPER_CREDIT = "Developed by " + DEVELOPER_NAME;

/** Only fixed, code-owned literals: safe to embed in generated print HTML. */
export const DEVELOPER_CREDIT_HTML =
  'Developed by <a href="' + DEVELOPER_PROFILE_URL + '" style="color:inherit;text-decoration:underline">' +
  DEVELOPER_NAME + '</a><small style="display:block;font-size:8px;line-height:1.2;color:inherit">' +
  DEVELOPER_PROFILE_PRINT_URL + '</small>';
