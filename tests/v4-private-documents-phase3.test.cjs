/* eslint-disable @typescript-eslint/no-require-imports -- Node built-in test runner. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const sql = read("supabase/migrations/20261113120000_project_client_document_files_phase3_v4.sql");
const gateway = read("supabase/functions/landview-data/index.ts");
const files = read("app/api/admin/projects/client-document-files/route.ts");
const services = read("app/api/admin/projects/service-document-requirements/route.ts");
const attachments = read("components/project-client-document-attachments.tsx");
const readiness = read("components/project-service-document-readiness.tsx");
const registry = read("components/project-client-document-registry.tsx");
const workspace = read("components/project-v4-workspace.tsx");

test("phase 3 migration is additive and storage bucket is private", () => {
  assert.match(sql, /public, file_size_limit, allowed_mime_types/);
  assert.match(sql, /'project-client-documents-v4', false, 10485760/);
  assert.match(sql, /create table if not exists public\.project_client_document_files/);
  assert.match(sql, /create table if not exists public\.project_service_document_requirements/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on public\.project_client_document_files from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.project_service_document_requirements from public, anon, authenticated/);
  assert.doesNotMatch(sql, /\btruncate\b|\bdrop table\b|\bdelete from\b|\bupdate public\.payments\b/i);
});

test("upload and download require authenticated management, project/receipt scope and production flags", () => {
  assert.match(files, /await requireLocalSession\(request\)/);
  assert.match(files, /hasCapability\(role, write \? "documents.manage" : "documents.view"\)/);
  assert.match(files, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(files, /LANDVIEW_V4_DOCUMENT_WRITES_ENABLED === "true"/);
  assert.match(files, /LANDVIEW_V4_DOCUMENT_BACKUP_VERIFIED === "true"/);
  assert.match(files, /sameOrigin\(request\)/);
  assert.match(files, /filters: \{ project_id: projectId, id: value\(id, 80\) \}/);
  assert.match(files, /register_id: receiptId/);
  assert.match(files, /MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(files, /status === "stored"/);
  assert.match(files, /"signClientDocumentDownload"/);
  assert.match(files, /"clientDocumentObjectInfo"/);
  assert.doesNotMatch(files, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE|sendWhatsApp|updateRows\("payments"/);
});

test("OIDC gateway signs only registered and scoped private file paths", () => {
  assert.match(gateway, /clientFileRow\(input.path, "pending"\)/);
  assert.match(gateway, /clientFileRow\(input.path, "stored"\)/);
  assert.match(gateway, /storage_path=eq/);
  assert.match(gateway, /"signClientDocumentUpload"/);
  assert.match(gateway, /"signClientDocumentDownload"/);
  assert.match(gateway, /expiresIn: 60/);
  assert.match(gateway, /Uploaded file type or byte length does not match the receipt/);
  assert.match(gateway, /"project_client_document_files"/);
  assert.match(gateway, /"project_service_document_requirements"/);
});

test("verified document readiness stays advisory and scoped to the chosen service", () => {
  for (const item of ["Photo", "NID / Passport / Birth Certificate", "Ownership Registry Paper", "Khotian", "Land Tax Slip"])
    assert.ok(services.includes(item));
  assert.match(services, /text\(row.verification_status\) === "Verified"/);
  assert.match(services, /text\(row.return_status\) !== "Returned"/);
  assert.match(services, /filters: \{ project_id: projectId, service_key: serviceKey \}/);
  assert.match(services, /"setRequirements"/);
  assert.match(services, /advisoryOnly: true/);
  assert.match(readiness, /Advisory only/);
  assert.match(readiness, /This preview does not override payment or delivery checks/);
  assert.doesNotMatch(services, /updateRows\("bills"|updateRows\("payments"|sendWhatsApp/);
});

test("attachments appear inside the receiving registry and remain locked in preview", () => {
  assert.match(attachments, /"PUT"/);
  assert.match(attachments, /"prepare"/);
  assert.match(attachments, /"complete"/);
  assert.match(attachments, /canWrite && inventory\.uploadEnabled/);
  assert.match(attachments, /Open securely/);
  assert.match(registry, /ProjectClientDocumentAttachments/);
  assert.match(workspace, /ProjectServiceDocumentReadiness/);
});
