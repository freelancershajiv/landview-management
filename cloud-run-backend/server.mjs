import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const BACKEND_SHARED_SECRET = String(process.env.BACKEND_SHARED_SECRET || "");

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAuthorized(req) {
  if (!BACKEND_SHARED_SECRET) return false;
  const supplied = req.headers["x-landview-backend-key"];
  return typeof supplied === "string" && safeEqual(supplied, BACKEND_SHARED_SECRET);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      success: true,
      service: "landview-cloud-run-backend",
      region: process.env.K_SERVICE ? "cloud-run" : "local",
      revision: process.env.K_REVISION || "local",
    });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { success: false, error: "Unauthorized." });
  }

  if (req.method === "GET" && url.pathname === "/api/project-billing") {
    return json(res, 501, {
      success: false,
      error: "Project billing migration is not enabled yet.",
      migrationReady: true,
    });
  }

  return json(res, 404, { success: false, error: "Not found." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LAND VIEW Cloud Run backend listening on port ${PORT}`);
});
