/* LAND VIEW — WEBSITE VISITOR ANALYTICS
 *
 * Stores public website analytics in a separate spreadsheet so page-view volume
 * does not inflate the Core management database. The spreadsheet is created on
 * the first valid analytics event and its ID is saved in Script Properties as:
 *   LAND_VIEW_ANALYTICS_SPREADSHEET_ID
 *
 * Precise browser coordinates are stored separately from ordinary page views.
 */

const LV_ANALYTICS_PROPERTY_ = "LAND_VIEW_ANALYTICS_SPREADSHEET_ID";
const LV_ANALYTICS_BOOK_NAME_ = "LAND VIEW Website Analytics";

const LV_ANALYTICS_VISITOR_HEADERS_ = [
  "Visitor_ID",
  "First_Seen",
  "Last_Seen",
  "First_Referrer",
  "Last_IP",
  "Country",
  "Region",
  "City",
  "IP_Latitude",
  "IP_Longitude",
  "Timezone",
  "Continent",
  "User_Agent",
  "Language",
  "Screen_Width",
  "Screen_Height",
  "Is_Bot",
  "Total_Sessions",
  "Total_Page_Views",
  "Precise_Latitude",
  "Precise_Longitude",
  "Precise_Accuracy_M",
  "Precise_Location_Updated_At"
];

const LV_ANALYTICS_SESSION_HEADERS_ = [
  "Session_ID",
  "Visitor_ID",
  "Started_At",
  "Last_Activity",
  "Entry_Page",
  "Last_Page",
  "Referrer",
  "IP",
  "Country",
  "Region",
  "City",
  "IP_Latitude",
  "IP_Longitude",
  "Timezone",
  "User_Agent",
  "Page_Count"
];

const LV_ANALYTICS_PAGE_VIEW_HEADERS_ = [
  "Event_ID",
  "Visitor_ID",
  "Session_ID",
  "Visited_At",
  "Page",
  "Title",
  "Referrer",
  "IP",
  "Country",
  "Region",
  "City",
  "IP_Latitude",
  "IP_Longitude",
  "Timezone",
  "Continent",
  "User_Agent",
  "Language",
  "Screen_Width",
  "Screen_Height",
  "Is_Bot",
  "Source_Host"
];

const LV_ANALYTICS_LOCATION_HEADERS_ = [
  "Event_ID",
  "Visitor_ID",
  "Session_ID",
  "Recorded_At",
  "Page",
  "Latitude",
  "Longitude",
  "Accuracy_M",
  "IP",
  "IP_Country",
  "IP_Region",
  "IP_City",
  "IP_Latitude",
  "IP_Longitude",
  "Source_Host"
];

function lvAnalyticsText_(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength || 500);
}

function lvAnalyticsId_(value, prefix) {
  const text = lvAnalyticsText_(value, 64);
  const pattern = new RegExp("^" + prefix + "_[0-9a-f-]{36}$", "i");
  if (!pattern.test(text)) throw new Error("Invalid analytics identifier.");
  return text;
}

function lvAnalyticsNumber_(value, min, max, required) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error("Missing analytics coordinate.");
    return "";
  }
  const number = Number(value);
  if (!isFinite(number) || number < min || number > max) {
    if (required) throw new Error("Invalid analytics coordinate.");
    return "";
  }
  return number;
}

function lvAnalyticsSafePath_(value) {
  let path = lvAnalyticsText_(value, 300) || "/";
  if (path.charAt(0) !== "/") path = "/";
  if (/^\/verify\//i.test(path)) return "/verify/[redacted]";
  if (/^\/certificate\/verify\//i.test(path)) return "/certificate/verify/[redacted]";
  if (/^\/owner-access\//i.test(path)) return "/owner-access/[redacted]";
  return path;
}

function lvAnalyticsSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = lvAnalyticsText_(props.getProperty(LV_ANALYTICS_PROPERTY_), 200);

  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      spreadsheetId = "";
    }
  }

  const setupLock = LockService.getScriptLock();
  setupLock.waitLock(10000);
  try {
    spreadsheetId = lvAnalyticsText_(props.getProperty(LV_ANALYTICS_PROPERTY_), 200);
    if (spreadsheetId) {
      try {
        return SpreadsheetApp.openById(spreadsheetId);
      } catch (error) {
        spreadsheetId = "";
      }
    }

    const ss = SpreadsheetApp.create(LV_ANALYTICS_BOOK_NAME_);
    props.setProperty(LV_ANALYTICS_PROPERTY_, ss.getId());
    lvAnalyticsEnsureSheets_(ss);
    return ss;
  } finally {
    setupLock.releaseLock();
  }
}

function lvAnalyticsEnsureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const currentHeaders = sheet.getLastColumn() >= headers.length
    ? sheet.getRange(1, 1, 1, headers.length).getValues()[0]
    : [];
  const mismatch = headers.some(function(header, index) {
    return String(currentHeaders[index] || "") !== header;
  });

  if (sheet.getLastRow() === 0 || mismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  return sheet;
}

function lvAnalyticsEnsureSheets_(ss) {
  const defaultSheet = ss.getSheetByName("Sheet1");
  const visitors = lvAnalyticsEnsureSheet_(ss, "Visitors", LV_ANALYTICS_VISITOR_HEADERS_);
  lvAnalyticsEnsureSheet_(ss, "Sessions", LV_ANALYTICS_SESSION_HEADERS_);
  lvAnalyticsEnsureSheet_(ss, "Page Views", LV_ANALYTICS_PAGE_VIEW_HEADERS_);
  lvAnalyticsEnsureSheet_(ss, "Location Events", LV_ANALYTICS_LOCATION_HEADERS_);

  if (defaultSheet && defaultSheet.getSheetId() !== visitors.getSheetId() && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (error) {}
  }
}

function lvAnalyticsFindRow_(sheet, column, value) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const found = sheet
    .getRange(2, column, lastRow - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .findNext();
  return found ? found.getRow() : 0;
}

function lvAnalyticsCellMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) { map[header] = index; });
  return map;
}

function lvAnalyticsGeo_(params) {
  return {
    ip: lvAnalyticsText_(params.ipAddress, 128),
    country: lvAnalyticsText_(params.ipCountry, 80),
    region: lvAnalyticsText_(params.ipRegion, 120),
    city: lvAnalyticsText_(params.ipCity, 160),
    ipLatitude: lvAnalyticsText_(params.ipLatitude, 40),
    ipLongitude: lvAnalyticsText_(params.ipLongitude, 40),
    timezone: lvAnalyticsText_(params.ipTimezone, 100),
    continent: lvAnalyticsText_(params.ipContinent, 20),
    userAgent: lvAnalyticsText_(params.userAgent, 500),
    sourceHost: lvAnalyticsText_(params.sourceHost, 160),
    language: lvAnalyticsText_(params.language, 40),
    screenWidth: lvAnalyticsNumber_(params.screenWidth, 0, 20000, false) || 0,
    screenHeight: lvAnalyticsNumber_(params.screenHeight, 0, 20000, false) || 0,
    isBot: params.isBot === true || String(params.isBot).toLowerCase() === "true"
  };
}

function lvAnalyticsUpsertVisitorPageView_(sheet, visitorId, now, params, geo, isNewSession) {
  const row = lvAnalyticsFindRow_(sheet, 1, visitorId);
  const map = lvAnalyticsCellMap_(LV_ANALYTICS_VISITOR_HEADERS_);

  if (!row) {
    const values = new Array(LV_ANALYTICS_VISITOR_HEADERS_.length).fill("");
    values[map.Visitor_ID] = visitorId;
    values[map.First_Seen] = now;
    values[map.Last_Seen] = now;
    values[map.First_Referrer] = lvAnalyticsText_(params.referrer, 500);
    values[map.Last_IP] = geo.ip;
    values[map.Country] = geo.country;
    values[map.Region] = geo.region;
    values[map.City] = geo.city;
    values[map.IP_Latitude] = geo.ipLatitude;
    values[map.IP_Longitude] = geo.ipLongitude;
    values[map.Timezone] = geo.timezone;
    values[map.Continent] = geo.continent;
    values[map.User_Agent] = geo.userAgent;
    values[map.Language] = geo.language;
    values[map.Screen_Width] = geo.screenWidth;
    values[map.Screen_Height] = geo.screenHeight;
    values[map.Is_Bot] = geo.isBot;
    values[map.Total_Sessions] = 1;
    values[map.Total_Page_Views] = 1;
    sheet.appendRow(values);
    return;
  }

  const values = sheet.getRange(row, 1, 1, LV_ANALYTICS_VISITOR_HEADERS_.length).getValues()[0];
  values[map.Last_Seen] = now;
  values[map.Last_IP] = geo.ip;
  values[map.Country] = geo.country;
  values[map.Region] = geo.region;
  values[map.City] = geo.city;
  values[map.IP_Latitude] = geo.ipLatitude;
  values[map.IP_Longitude] = geo.ipLongitude;
  values[map.Timezone] = geo.timezone;
  values[map.Continent] = geo.continent;
  values[map.User_Agent] = geo.userAgent;
  values[map.Language] = geo.language;
  values[map.Screen_Width] = geo.screenWidth;
  values[map.Screen_Height] = geo.screenHeight;
  values[map.Is_Bot] = geo.isBot;
  values[map.Total_Page_Views] = Number(values[map.Total_Page_Views] || 0) + 1;
  if (isNewSession) values[map.Total_Sessions] = Number(values[map.Total_Sessions] || 0) + 1;
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function lvAnalyticsUpsertSession_(sheet, visitorId, sessionId, now, params, geo) {
  const row = lvAnalyticsFindRow_(sheet, 1, sessionId);
  const map = lvAnalyticsCellMap_(LV_ANALYTICS_SESSION_HEADERS_);
  const page = lvAnalyticsSafePath_(params.path);

  if (!row) {
    const values = new Array(LV_ANALYTICS_SESSION_HEADERS_.length).fill("");
    values[map.Session_ID] = sessionId;
    values[map.Visitor_ID] = visitorId;
    values[map.Started_At] = now;
    values[map.Last_Activity] = now;
    values[map.Entry_Page] = page;
    values[map.Last_Page] = page;
    values[map.Referrer] = lvAnalyticsText_(params.referrer, 500);
    values[map.IP] = geo.ip;
    values[map.Country] = geo.country;
    values[map.Region] = geo.region;
    values[map.City] = geo.city;
    values[map.IP_Latitude] = geo.ipLatitude;
    values[map.IP_Longitude] = geo.ipLongitude;
    values[map.Timezone] = geo.timezone;
    values[map.User_Agent] = geo.userAgent;
    values[map.Page_Count] = 1;
    sheet.appendRow(values);
    return true;
  }

  const values = sheet.getRange(row, 1, 1, LV_ANALYTICS_SESSION_HEADERS_.length).getValues()[0];
  values[map.Last_Activity] = now;
  values[map.Last_Page] = page;
  values[map.IP] = geo.ip;
  values[map.Country] = geo.country;
  values[map.Region] = geo.region;
  values[map.City] = geo.city;
  values[map.IP_Latitude] = geo.ipLatitude;
  values[map.IP_Longitude] = geo.ipLongitude;
  values[map.Timezone] = geo.timezone;
  values[map.User_Agent] = geo.userAgent;
  values[map.Page_Count] = Number(values[map.Page_Count] || 0) + 1;
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  return false;
}

function lvAnalyticsAppendPageView_(sheet, visitorId, sessionId, now, params, geo) {
  sheet.appendRow([
    "PV-" + Utilities.getUuid(),
    visitorId,
    sessionId,
    now,
    lvAnalyticsSafePath_(params.path),
    lvAnalyticsText_(params.title, 180),
    lvAnalyticsText_(params.referrer, 500),
    geo.ip,
    geo.country,
    geo.region,
    geo.city,
    geo.ipLatitude,
    geo.ipLongitude,
    geo.timezone,
    geo.continent,
    geo.userAgent,
    geo.language,
    geo.screenWidth,
    geo.screenHeight,
    geo.isBot,
    geo.sourceHost
  ]);
}

function lvAnalyticsStorePreciseLocation_(visitorSheet, locationSheet, visitorId, sessionId, now, params, geo) {
  const latitude = lvAnalyticsNumber_(params.preciseLatitude, -90, 90, true);
  const longitude = lvAnalyticsNumber_(params.preciseLongitude, -180, 180, true);
  const accuracy = lvAnalyticsNumber_(params.preciseAccuracyM, 0, 100000, true);
  const row = lvAnalyticsFindRow_(visitorSheet, 1, visitorId);
  const map = lvAnalyticsCellMap_(LV_ANALYTICS_VISITOR_HEADERS_);

  if (!row) {
    const values = new Array(LV_ANALYTICS_VISITOR_HEADERS_.length).fill("");
    values[map.Visitor_ID] = visitorId;
    values[map.First_Seen] = now;
    values[map.Last_Seen] = now;
    values[map.Last_IP] = geo.ip;
    values[map.Country] = geo.country;
    values[map.Region] = geo.region;
    values[map.City] = geo.city;
    values[map.IP_Latitude] = geo.ipLatitude;
    values[map.IP_Longitude] = geo.ipLongitude;
    values[map.Timezone] = geo.timezone;
    values[map.Continent] = geo.continent;
    values[map.User_Agent] = geo.userAgent;
    values[map.Total_Sessions] = 0;
    values[map.Total_Page_Views] = 0;
    values[map.Precise_Latitude] = latitude;
    values[map.Precise_Longitude] = longitude;
    values[map.Precise_Accuracy_M] = accuracy;
    values[map.Precise_Location_Updated_At] = now;
    visitorSheet.appendRow(values);
  } else {
    const values = visitorSheet.getRange(row, 1, 1, LV_ANALYTICS_VISITOR_HEADERS_.length).getValues()[0];
    values[map.Last_Seen] = now;
    values[map.Last_IP] = geo.ip;
    values[map.Precise_Latitude] = latitude;
    values[map.Precise_Longitude] = longitude;
    values[map.Precise_Accuracy_M] = accuracy;
    values[map.Precise_Location_Updated_At] = now;
    visitorSheet.getRange(row, 1, 1, values.length).setValues([values]);
  }

  locationSheet.appendRow([
    "LOC-" + Utilities.getUuid(),
    visitorId,
    sessionId,
    now,
    lvAnalyticsSafePath_(params.path),
    latitude,
    longitude,
    accuracy,
    geo.ip,
    geo.country,
    geo.region,
    geo.city,
    geo.ipLatitude,
    geo.ipLongitude,
    geo.sourceHost
  ]);
}

function trackVisitorEvent(params) {
  params = params || {};
  const eventType = lvAnalyticsText_(params.eventType, 40);
  if (eventType !== "page_view" && eventType !== "precise_location") {
    throw new Error("Invalid visitor analytics event.");
  }

  const visitorId = lvAnalyticsId_(params.visitorId, "vis");
  const sessionId = lvAnalyticsId_(params.sessionId, "ses");
  const ss = lvAnalyticsSpreadsheet_();
  lvAnalyticsEnsureSheets_(ss);

  const visitors = ss.getSheetByName("Visitors");
  const sessions = ss.getSheetByName("Sessions");
  const pageViews = ss.getSheetByName("Page Views");
  const locations = ss.getSheetByName("Location Events");
  const geo = lvAnalyticsGeo_(params);
  const now = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (eventType === "precise_location") {
      lvAnalyticsStorePreciseLocation_(visitors, locations, visitorId, sessionId, now, params, geo);
      return { success: true, data: { stored: true, eventType: eventType } };
    }

    const sessionIsNew = lvAnalyticsFindRow_(sessions, 1, sessionId) === 0;
    lvAnalyticsUpsertSession_(sessions, visitorId, sessionId, now, params, geo);
    lvAnalyticsUpsertVisitorPageView_(visitors, visitorId, now, params, geo, sessionIsNew);
    lvAnalyticsAppendPageView_(pageViews, visitorId, sessionId, now, params, geo);

    return { success: true, data: { stored: true, eventType: eventType } };
  } finally {
    lock.releaseLock();
  }
}

function getVisitorAnalytics(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin analytics access required.");

  const ss = lvAnalyticsSpreadsheet_();
  lvAnalyticsEnsureSheets_(ss);
  const visitors = ss.getSheetByName("Visitors");
  const sessions = ss.getSheetByName("Sessions");
  const pageViews = ss.getSheetByName("Page Views");
  const locations = ss.getSheetByName("Location Events");

  const recentRows = function(sheet, headers, limit) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const count = Math.min(Number(limit || 100), lastRow - 1);
    const values = sheet.getRange(lastRow - count + 1, 1, count, headers.length).getValues();
    return values.reverse().map(function(row) {
      const item = {};
      headers.forEach(function(header, index) { item[header] = row[index]; });
      return item;
    });
  };

  return {
    success: true,
    data: {
      spreadsheetId: ss.getId(),
      totals: {
        visitors: Math.max(0, visitors.getLastRow() - 1),
        sessions: Math.max(0, sessions.getLastRow() - 1),
        pageViews: Math.max(0, pageViews.getLastRow() - 1),
        preciseLocationEvents: Math.max(0, locations.getLastRow() - 1)
      },
      recentVisitors: recentRows(visitors, LV_ANALYTICS_VISITOR_HEADERS_, 50),
      recentPageViews: recentRows(pageViews, LV_ANALYTICS_PAGE_VIEW_HEADERS_, 100),
      recentLocations: recentRows(locations, LV_ANALYTICS_LOCATION_HEADERS_, 50)
    }
  };
}

function getVisitorAnalyticsSpreadsheetUrlFromEditor() {
  const ss = lvAnalyticsSpreadsheet_();
  lvAnalyticsEnsureSheets_(ss);
  Logger.log(ss.getUrl());
  return ss.getUrl();
}
