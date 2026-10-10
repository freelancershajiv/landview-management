"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CertificateDocument, printCertificate } from "@/components/certificate-document";

type CertificateType = "project" | "employee" | "intern" | "building";
type IssuableType = "project" | "employee" | "intern";
type CertificateKind =
  | "load_bearing"
  | "construction_supervision"
  | "construction_completion"
  | "experience"
  | "salary"
  | "autocad_experience"
  | "internship_completion"
  | "internship_experience"
  | "autocad_training"
  | "architectural_drafting_training"
  | "site_supervision_training"
  | "industrial_attachment";

type CertificateRecord = {
  certificateId: string; verificationUrl?: string; qrUrl?: string; issuedAt: string; type: CertificateType; category?: string;
  name: string; address: string; position: string; subject: string; reference: string; description: string;
  fatherName?: string; motherName?: string; nidNo?: string; expiresAt?: string; status?: string; revision?: number;
  parentId?: string; supersededBy?: string; revokedAt?: string; revokedReason?: string; deletedAt?: string; deletedReason?: string;
  institution?: string; department?: string; studentId?: string; supervisor?: string; trainingArea?: string; serviceFrom?: string; serviceTo?: string;
};

type EmployeeLookup = { employeeCode:string; name:string; designation:string; department:string; joiningDate:string; status:string };
type ProjectLookup = { projectCode:string; projectName:string; clientName:string; address:string; projectType:string; location:string; plotArea:string|number; floors:string|number; storiesText:string; district:string; thana:string; mouza:string; jlNo:string; dagNo:string };
type KindConfig = { type: IssuableType; label: string; subject: string; position: string; statement: string; needsPeriod?: boolean };

const kinds: Record<CertificateKind, KindConfig> = {
  load_bearing: { type: "project", label: "Load Bearing Certificate", subject: "Load Bearing & Construction Works Certificate", position: "Owner / Client", statement: "" },
  construction_supervision: { type: "project", label: "Construction Supervision Certificate", subject: "Construction Supervision Certificate", position: "Owner / Client", statement: "" },
  construction_completion: { type: "project", label: "Construction Completion Certificate", subject: "Construction Completion Certificate", position: "Owner / Client", statement: "" },
  experience: {
    type: "employee", label: "Experience Certificate", subject: "Experience Certificate", position: "Employee", needsPeriod: true,
    statement: "During the tenure, the employee performed assigned professional duties with responsibility, discipline and technical competence. The employee demonstrated good coordination, problem-solving ability and commitment to project quality.\n\nWe wish continued success in future professional endeavors."
  },
  salary: {
    type: "employee", label: "Salary Certificate", subject: "Salary Certificate", position: "Employee",
    statement: "This is to certify that the employee named above is / was employed with LAND VIEW — Engineering & Architectural Consultancy in the stated designation. This certificate is issued upon request for official salary / employment confirmation purposes."
  },
  autocad_experience: {
    type: "employee", label: "AutoCAD Practical Work Experience", subject: "AutoCAD Practical Work Experience Certificate", position: "Architectural Designer / AutoCAD Draftsman", needsPeriod: true,
    statement: "During the stated service period, the employee acquired practical work experience in AutoCAD drafting and architectural drawing preparation through professional involvement in architectural and engineering projects.\n\n• Preparing architectural floor plans, elevations and sections.\n• Preparing working drawings, site plans and layout plans.\n• Coordinating structural, electrical and plumbing drawings.\n• Preparing detailed architectural and approval drawings.\n• Carrying out drawing revisions, dimensioning, layer management, scaling, plotting and sheet preparation.\n\nThe employee demonstrated satisfactory technical ability, drawing accuracy and practical knowledge of AutoCAD-based project documentation."
  },
  internship_completion: {
    type: "intern", label: "Internship Completion Certificate", subject: "Internship Completion Certificate", position: "Intern Student", needsPeriod: true,
    statement: "This is to certify that the student successfully completed the assigned internship / practical training program with LAND VIEW — Engineering & Architectural Consultancy during the stated period. The student participated in practical office and project activities under professional supervision and maintained satisfactory conduct throughout the training."
  },
  internship_experience: {
    type: "intern", label: "Internship Experience Certificate", subject: "Internship Experience Certificate", position: "Intern Student", needsPeriod: true,
    statement: "During the internship period, the student received practical exposure to architectural and engineering consultancy workflows, drawing preparation, project coordination and professional office practices. The student showed interest, punctuality and a willingness to learn throughout the training period."
  },
  autocad_training: {
    type: "intern", label: "AutoCAD Practical Training", subject: "AutoCAD Practical Training Certificate", position: "AutoCAD Intern", needsPeriod: true,
    statement: "During the practical training period, the student received hands-on training in AutoCAD drafting and drawing preparation. Training included architectural floor plans, elevations, sections, working drawings, dimensioning, layers, annotations, scaling, plotting and sheet preparation. The student completed the assigned practical exercises and demonstrated satisfactory progress."
  },
  architectural_drafting_training: {
    type: "intern", label: "Architectural Drafting Training", subject: "Architectural Drafting Practical Training Certificate", position: "Architectural Intern", needsPeriod: true,
    statement: "During the training period, the student received practical exposure to architectural drafting, planning, elevations, sections, working drawings, drawing coordination and presentation of architectural documents. The student participated in supervised practical assignments and demonstrated satisfactory learning progress."
  },
  site_supervision_training: {
    type: "intern", label: "Site Supervision Training", subject: "Site Supervision Practical Training Certificate", position: "Site Supervision Intern", needsPeriod: true,
    statement: "During the training period, the student received supervised practical exposure to construction site activities, drawing interpretation, reinforcement and concrete work observation, quality-control practices, measurement, contractor coordination and site reporting. The student maintained satisfactory conduct and participation."
  },
  industrial_attachment: {
    type: "intern", label: "Industrial Attachment / Internship", subject: "Industrial Attachment & Internship Certificate", position: "Industrial Attachment Student", needsPeriod: true,
    statement: "This is to certify that the student completed the required industrial attachment / internship with LAND VIEW — Engineering & Architectural Consultancy during the stated period. The attachment included supervised practical exposure relevant to the student's academic discipline and professional development."
  },
};

const kindOrder: Record<IssuableType, CertificateKind[]> = {
  project: ["load_bearing", "construction_supervision", "construction_completion"],
  employee: ["experience", "autocad_experience", "salary"],
  intern: ["internship_completion", "internship_experience", "autocad_training", "architectural_drafting_training", "site_supervision_training", "industrial_attachment"],
};

function localDate(value?: string) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }
function today() { return localDate(new Date().toISOString()); }
function displayDate(value?: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }); }
function ordinalDate(value: string) { if (!value) return ""; const [year, month, day] = value.split("-").map(Number); const d = new Date(Date.UTC(year, month - 1, day)); if (Number.isNaN(d.getTime())) return value; const n = d.getUTCDate(); const mod100 = n % 100; const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"; return `${n}${suffix} ${d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`; }
function stripServicePeriod(value: string) { return value.replace(/^Service Period:\s*[^\n]+\n*/i, "").trimStart(); }
function kindFromSubject(subject: string, type: CertificateType): CertificateKind {
  const s = (subject || "").toLowerCase();
  if (s.includes("load bearing")) return "load_bearing";
  if (s.includes("construction supervision")) return "construction_supervision";
  if (s.includes("construction completion")) return "construction_completion";
  if (s.includes("salary")) return "salary";
  if (s.includes("autocad practical work")) return "autocad_experience";
  if (s.includes("autocad practical training")) return "autocad_training";
  if (s.includes("architectural drafting")) return "architectural_drafting_training";
  if (s.includes("site supervision")) return "site_supervision_training";
  if (s.includes("industrial attachment")) return "industrial_attachment";
  if (s.includes("internship experience")) return "internship_experience";
  if (type === "intern") return "internship_completion";
  return type === "employee" ? "experience" : "load_bearing";
}

function projectCertificateStatement(kind: CertificateKind, values: { name: string; buildingStories: string; buildingUse: string; saDag: string; bsDag: string; jlNo: string; mouza: string; landArea: string; ps: string; district: string; structuralDesigner: string; soilTestCompany: string; soilTestDate: string; constructionProgress: string; }) {
  const owner = values.name.trim(); const stories = values.buildingStories.trim(); const use = values.buildingUse.trim();
  const location = `Dag No.: S.A. – ${values.saDag.trim()}, B.S. – ${values.bsDag.trim()}; J.L. No. – ${values.jlNo.trim()}, Mouza – ${values.mouza.trim()}; Area of Land – ${values.landArea.trim()} decimal; P.S. – ${values.ps.trim()}, District – ${values.district.trim()}`;
  if (kind === "load_bearing") return `This is to certify that the structural design of the proposed ${stories} Storied ${use} Building of ${owner} at ${location} has been prepared by ${values.structuralDesigner.trim()}. The design of the foundation, columns, grade beams, roof beams, roof slabs, stairs and other structural members has been reviewed and checked by the undersigned and is considered adequate to bear the design loads of the proposed building, subject to construction in accordance with the approved drawings, specifications and design assumptions.\n\nThe foundation design has been prepared considering the soil test report provided by ${values.soilTestCompany.trim()}, dated ${values.soilTestDate.trim()}. The structural design has also been prepared considering the applicable earthquake loads and provisions of the Bangladesh National Building Code (BNBC).\n\nThe construction works up to ${values.constructionProgress.trim()} have been carried out under direct supervision in accordance with the approved drawings and design. Further construction works of this building shall continue under professional supervision.`;
  const scope = kind === "construction_supervision" ? "Construction supervision has been provided for the project in accordance with the approved drawings, structural design, applicable specifications and site records." : "The construction work for the project has been completed to the extent stated in this certificate in accordance with the approved drawings, structural design, applicable specifications and available supervision records.";
  return `This is to certify that the proposed ${stories} Storied ${use} Building of ${owner} at ${location} was structurally designed by ${values.structuralDesigner.trim()}. The foundation design considered the soil test report provided by ${values.soilTestCompany.trim()}, dated ${values.soilTestDate.trim()}, and the structural design considered the applicable earthquake provisions of the Bangladesh National Building Code (BNBC).\n\n${scope}\n\nRecorded construction stage: ${values.constructionProgress.trim()}.`;
}

const styles = `
.certShell{max-width:1500px;margin:0 auto;padding:22px}.certHeader{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}.certHeader h1{margin:0;font-size:28px}.certHeader p{margin:5px 0 0;color:#667085}.tabs,.typeTabs,.kindTabs{display:flex;gap:8px;flex-wrap:wrap}.tabs button,.typeTabs button,.kindTabs button{border:1px solid #d0d5dd;background:#fff;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer}.tabs button.active,.typeTabs button.active,.kindTabs button.active{background:#151515;color:#fff;border-color:#151515}.layout{display:grid;grid-template-columns:minmax(420px,1fr) minmax(560px,1.2fr);gap:18px;align-items:start}.card{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:18px;box-shadow:0 3px 12px #1018280c}.sectionTitle{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 12px}.sectionTitle h2{font-size:17px;margin:0}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:12px;font-weight:800;color:#344054}.field input,.field select,.field textarea{width:100%;border:1px solid #d0d5dd;border-radius:9px;padding:10px 11px;background:#fff;color:#101828;font:inherit}.field textarea{min-height:145px;resize:vertical}.hint{font-size:11px;color:#667085}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.btn{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:9px 13px;font-weight:800;cursor:pointer}.btn.primary{background:#d71920;color:#fff;border-color:#d71920}.btn.dark{background:#171717;color:#fff;border-color:#171717}.btn.danger{color:#b42318;border-color:#fda29b}.btn:disabled{opacity:.55;cursor:not-allowed}.error{margin:10px 0;padding:10px 12px;border-radius:9px;background:#fef3f2;color:#b42318;font-size:13px}.success{margin:10px 0;padding:10px 12px;border-radius:9px;background:#ecfdf3;color:#027a48;font-size:13px}.previewWrap{overflow:auto;background:#f2f4f7;border-radius:12px;padding:15px;max-height:79vh}.registryTools{display:grid;grid-template-columns:1fr 180px 180px;gap:10px;margin-bottom:12px}.tableWrap{overflow:auto;border:1px solid #e4e7ec;border-radius:12px}.registry{width:100%;border-collapse:collapse;min-width:1050px}.registry th,.registry td{padding:11px 12px;border-bottom:1px solid #eaecf0;text-align:left;font-size:12px;vertical-align:top}.registry th{background:#f9fafb;color:#475467;font-size:11px;text-transform:uppercase;letter-spacing:.4px}.registry strong{display:block;font-size:12.5px}.muted{color:#667085;font-size:11px}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;background:#ecfdf3;color:#027a48}.status.revoked,.status.withdrawn,.status.deleted{background:#fef3f2;color:#b42318}.status.superseded{background:#fffaeb;color:#b54708}.rowActions{display:flex;gap:6px;flex-wrap:wrap}.rowActions button{font-size:10px;padding:6px 8px}.empty{padding:30px;text-align:center;color:#667085}.divider{height:1px;background:#eaecf0;margin:16px 0}.smallTitle{font-size:13px;font-weight:900;margin:4px 0 10px}.privacy{background:#fffaeb;border:1px solid #fedf89;padding:9px 11px;border-radius:9px;font-size:11px;color:#7a2e0e;margin-top:10px}.lookup{background:#f9fafb;border:1px solid #eaecf0;border-radius:10px;padding:11px;margin:12px 0}.lookup label{display:block;font-size:11px;font-weight:900;margin-bottom:6px}.lookup select{width:100%;padding:9px 10px;border:1px solid #d0d5dd;border-radius:8px;background:#fff}
@media(max-width:1100px){.layout{grid-template-columns:1fr}.previewWrap{max-height:none}}@media(max-width:700px){.certShell{padding:12px}.certHeader{flex-direction:column}.formGrid,.registryTools{grid-template-columns:1fr}.field.full{grid-column:auto}.card{padding:13px}}
`;

export default function CertificatesPage() {
  const [tab, setTab] = useState<"issue"|"registry">("issue");
  const [type, setType] = useState<IssuableType>("project");
  const [kind, setKind] = useState<CertificateKind>("load_bearing");
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [employees,setEmployees]=useState<EmployeeLookup[]>([]); const [projects,setProjects]=useState<ProjectLookup[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [issued, setIssued] = useState<CertificateRecord | null>(null); const [reissueOf, setReissueOf] = useState("");
  const [query, setQuery] = useState(""); const [typeFilter, setTypeFilter] = useState("all"); const [statusFilter, setStatusFilter] = useState("all");

  const [name,setName]=useState(""); const [address,setAddress]=useState(""); const [position,setPosition]=useState(kinds.load_bearing.position); const [subject,setSubject]=useState(kinds.load_bearing.subject); const [reference,setReference]=useState(""); const [description,setDescription]=useState(kinds.load_bearing.statement);
  const [fatherName,setFatherName]=useState(""); const [motherName,setMotherName]=useState(""); const [nidNo,setNidNo]=useState("");
  const [serviceFrom,setServiceFrom]=useState(""); const [serviceTo,setServiceTo]=useState(""); const [issueDate,setIssueDate]=useState(today()); const [expiryDate,setExpiryDate]=useState("");
  const [institution,setInstitution]=useState(""); const [department,setDepartment]=useState(""); const [studentId,setStudentId]=useState(""); const [supervisor,setSupervisor]=useState(""); const [trainingArea,setTrainingArea]=useState("");
  const [buildingStories,setBuildingStories]=useState("07 (Seven)"); const [buildingUse,setBuildingUse]=useState("Residential"); const [saDag,setSaDag]=useState(""); const [bsDag,setBsDag]=useState(""); const [jlNo,setJlNo]=useState(""); const [mouza,setMouza]=useState(""); const [landArea,setLandArea]=useState(""); const [ps,setPs]=useState(""); const [district,setDistrict]=useState("Feni"); const [structuralDesigner,setStructuralDesigner]=useState(""); const [soilTestCompany,setSoilTestCompany]=useState(""); const [soilTestDate,setSoilTestDate]=useState(""); const [constructionProgress,setConstructionProgress]=useState("ground floor casting including the foundation");

  async function loadRegistry(){setLoadingRegistry(true);try{const r=await fetch("/api/certificates",{cache:"no-store",credentials:"same-origin"});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load certificate registry.");setRecords(Array.isArray(j?.data?.certificates)?j.data.certificates:[]);setEmployees(Array.isArray(j?.data?.employees)?j.data.employees:[]);setProjects(Array.isArray(j?.data?.projects)?j.data.projects:[]);}catch(e:any){setError(e?.message||"Could not load certificate registry.");}finally{setLoadingRegistry(false);}}
  useEffect(()=>{void loadRegistry();},[]);

  function selectKind(next: CertificateKind, clear=true){const cfg=kinds[next];setType(cfg.type);setKind(next);setPosition(cfg.position);setSubject(cfg.subject);setDescription(cfg.statement);setIssued(null);setError("");setNotice("");if(clear){setName("");setAddress("");setReference("");setFatherName("");setMotherName("");setNidNo("");setServiceFrom("");setServiceTo("");setInstitution("");setDepartment("");setStudentId("");setSupervisor("");setTrainingArea("");setIssueDate(today());setExpiryDate("");setReissueOf("");}}
  function selectType(next:IssuableType){selectKind(kindOrder[next][0],true);}
  function applyEmployee(code:string){const e=employees.find(x=>x.employeeCode===code);if(!e)return;setName(e.name||"");setPosition(e.designation||kinds[kind].position);setReference(e.employeeCode||"");if(kinds[kind].needsPeriod&&e.joiningDate)setServiceFrom(localDate(e.joiningDate));setNotice(`Employee data loaded from ${e.employeeCode}. Review the details before issuing.`);}
  function applyProject(code:string){const p=projects.find(x=>x.projectCode===code);if(!p)return;setReference(p.projectCode||"");setName(p.clientName||p.projectName||"");setAddress(p.address||p.location||"");setBuildingUse(p.projectType||"Residential");if(p.storiesText)setBuildingStories(p.storiesText);else if(String(p.floors||"").trim())setBuildingStories(String(p.floors));if(String(p.plotArea??"").trim())setLandArea(String(p.plotArea));if(p.district)setDistrict(p.district);if(p.thana)setPs(p.thana);if(p.mouza)setMouza(p.mouza);if(p.jlNo)setJlNo(p.jlNo);if(p.dagNo)setBsDag(p.dagNo);setNotice(`Project data loaded from ${p.projectCode}. Complete any land/design details that are not stored in the project record.`);}

  function buildDescription(){
    if(type==="project") return projectCertificateStatement(kind,{name,buildingStories,buildingUse,saDag,bsDag,jlNo,mouza,landArea,ps,district,structuralDesigner,soilTestCompany,soilTestDate,constructionProgress});
    const base=stripServicePeriod(description);
    const period=(kinds[kind].needsPeriod&&serviceFrom&&serviceTo)?`Service Period: ${ordinalDate(serviceFrom)} to ${ordinalDate(serviceTo)}\n\n`:"";
    if(type==="intern"){
      const details=[institution?`Institution: ${institution}`:"",department?`Department / Technology: ${department}`:"",trainingArea?`Training Area: ${trainingArea}`:"",supervisor?`Supervisor: ${supervisor}`:""].filter(Boolean).join("\n");
      return `${period}${details}${details?"\n\n":""}${base}`.trim();
    }
    return `${period}${base}`.trim();
  }

  const draft=useMemo<CertificateRecord>(()=>({certificateId:reissueOf?`${reissueOf} · DRAFT REVISION`:"DRAFT — NOT ISSUED",issuedAt:new Date(`${issueDate}T12:00:00+06:00`).toISOString(),type,name:name||"Certificate Recipient",address,position,subject,reference,description:buildDescription(),fatherName,motherName,nidNo,institution,department,studentId,supervisor,trainingArea,serviceFrom,serviceTo,status:"Draft",revision:reissueOf?2:1}),[type,kind,name,address,position,subject,reference,description,fatherName,motherName,nidNo,institution,department,studentId,supervisor,trainingArea,serviceFrom,serviceTo,issueDate,reissueOf,buildingStories,buildingUse,saDag,bsDag,jlNo,mouza,landArea,ps,district,structuralDesigner,soilTestCompany,soilTestDate,constructionProgress]);

  async function issue(e:FormEvent){e.preventDefault();if(loading)return;setError("");setNotice("");if(!name.trim()||!subject.trim()||!position.trim()){setError("Name, designation / role and certificate subject are required.");return;}if(kinds[kind].needsPeriod&&(!serviceFrom||!serviceTo)){setError("Start and end dates are required for this certificate.");return;}if(serviceFrom&&serviceTo&&serviceFrom>serviceTo){setError("End date cannot be earlier than start date.");return;}if(type==="intern"&&!institution.trim()){setError("Institute / college is required for an intern certificate.");return;}if(type==="project"&&[buildingStories,buildingUse,saDag,bsDag,jlNo,mouza,landArea,ps,district,structuralDesigner,soilTestCompany,soilTestDate,constructionProgress].some(v=>!v.trim())){setError("Complete all project, land, structural design, soil test and construction-stage fields.");return;}
    const confirmed=window.confirm(`${reissueOf?"Reissue":"Issue"} ${subject}\n\nRecipient: ${name}\nIssue date: ${issueDate}\n\nOnce issued, changes should be made through Reissue.`);if(!confirmed)return;
    setLoading(true);try{const body={type,category:kind,name,address,fatherName,motherName,nidNo,position,subject,reference,description:buildDescription(),institution,department,studentId,supervisor,trainingArea,serviceFrom,serviceTo,reissueOf,issuedAt:new Date(`${issueDate}T12:00:00+06:00`).toISOString(),expiresAt:expiryDate?new Date(`${expiryDate}T23:59:59+06:00`).toISOString():""};const r=await fetch("/api/certificates",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not issue certificate.");setIssued(j.data);setNotice(`Certificate issued successfully: ${j.data.certificateId}`);setReissueOf("");await loadRegistry();}catch(e:any){setError(e?.message||"Could not issue certificate.");}finally{setLoading(false);}}

  function editReissue(item:CertificateRecord){if(item.type==="building"){setError("Legacy building certificates remain available in the registry but are not reissued from the new certificate form.");return;}const k=kindFromSubject(item.subject,item.type);const cfg=kinds[k];setType(cfg.type);setKind(k);setName(item.name||"");setAddress(item.address||"");setPosition(item.position||cfg.position);setSubject(item.subject||cfg.subject);setReference(item.reference||"");setDescription(stripServicePeriod(item.description||cfg.statement));setFatherName(item.fatherName||"");setMotherName(item.motherName||"");setNidNo(item.nidNo||"");setInstitution(item.institution||"");setDepartment(item.department||"");setStudentId(item.studentId||"");setSupervisor(item.supervisor||"");setTrainingArea(item.trainingArea||"");setServiceFrom(localDate(item.serviceFrom)||"");setServiceTo(localDate(item.serviceTo)||"");setIssueDate(today());setExpiryDate(localDate(item.expiresAt));setReissueOf(item.certificateId);setIssued(null);setTab("issue");setError("");setNotice(`Preparing revision of ${item.certificateId}.`);window.scrollTo({top:0,behavior:"smooth"});}

  async function processCertificate(item:CertificateRecord,action:"revoke"|"withdraw"){const reason=window.prompt(`Reason to ${action} ${item.certificateId}:`);if(!reason?.trim())return;try{const r=await fetch("/api/certificates",{method:"PATCH",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({action,certificateId:item.certificateId,reason:reason.trim()})});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not update certificate.");setNotice(`${item.certificateId} is now ${j.data.status}.`);await loadRegistry();}catch(e:any){setError(e?.message||"Could not update certificate.");}}
  async function copyLink(item:CertificateRecord){if(!item.verificationUrl){setError("Verification link is unavailable for this certificate.");return;}await navigator.clipboard.writeText(item.verificationUrl);setNotice("Verification link copied.");}
  async function printCurrent(){try{await printCertificate();}catch(e:any){setError(e?.message||"Could not print certificate.");}}

  const filtered=useMemo(()=>records.filter(item=>{const q=query.trim().toLowerCase();const text=[item.certificateId,item.name,item.subject,item.reference,item.institution,item.studentId,item.status].join(" ").toLowerCase();return(!q||text.includes(q))&&(typeFilter==="all"||item.type===typeFilter)&&(statusFilter==="all"||(item.status||"Active").toLowerCase()===statusFilter);}),[records,query,typeFilter,statusFilter]);
  const preview=issued||draft;

  return <main className="certShell"><style>{styles}</style>
    <div className="certHeader"><div><h1>Certificate Management</h1><p>Issue, preview, verify, reissue, revoke and withdraw official LAND VIEW certificates.</p></div><div className="tabs"><button className={tab==="issue"?"active":""} onClick={()=>setTab("issue")}>Issue Certificate</button><button className={tab==="registry"?"active":""} onClick={()=>setTab("registry")}>Certificate Registry</button></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}

    {tab==="issue"&&<div className="layout">
      <form className="card" onSubmit={issue}>
        <div className="sectionTitle"><h2>{reissueOf?"Reissue Certificate":"New Certificate"}</h2>{reissueOf&&<span className="status superseded">Revision of {reissueOf}</span>}</div>
        <div className="smallTitle">Recipient</div><div className="typeTabs">{(["project","employee","intern"] as IssuableType[]).map(t=><button type="button" key={t} className={type===t?"active":""} onClick={()=>selectType(t)}>{t==="project"?"Project / Client":t==="employee"?"Employee":"Intern Student"}</button>)}</div>
        {type==="project"&&projects.length>0&&<div className="lookup"><label>Load Existing Project</label><select defaultValue="" onChange={e=>{if(e.target.value)applyProject(e.target.value);e.currentTarget.value="";}}><option value="">Select File ID / project…</option>{projects.map(p=><option key={p.projectCode} value={p.projectCode}>{p.projectCode} — {p.clientName||p.projectName||p.location}</option>)}</select><span className="hint">Available project fields will fill automatically; review missing land/design details.</span></div>}
        {type==="employee"&&employees.length>0&&<div className="lookup"><label>Load Existing Employee</label><select defaultValue="" onChange={e=>{if(e.target.value)applyEmployee(e.target.value);e.currentTarget.value="";}}><option value="">Select employee…</option>{employees.map(emp=><option key={emp.employeeCode} value={emp.employeeCode}>{emp.employeeCode} — {emp.name}{emp.designation?` · ${emp.designation}`:""}</option>)}</select><span className="hint">Name, designation, Employee ID and joining date fill automatically.</span></div>}
        <div className="divider"/><div className="smallTitle">Certificate Type</div><div className="kindTabs">{kindOrder[type].map(k=><button type="button" key={k} className={kind===k?"active":""} onClick={()=>selectKind(k,false)}>{kinds[k].label}</button>)}</div>
        <div className="divider"/><div className="formGrid">
          <div className="field"><label>{type==="project"?"Owner / Client Name":"Name"}</label><input value={name} onChange={e=>setName(e.target.value)} required/></div>
          <div className="field"><label>{type==="intern"?"Student ID / Roll":"Reference / ID"}</label><input value={type==="intern"?studentId:reference} onChange={e=>type==="intern"?setStudentId(e.target.value):setReference(e.target.value)} placeholder={type==="project"?"File ID / reference":"Optional"}/></div>
          <div className="field full"><label>Address</label><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Address (optional when not required)"/></div>
          <div className="field"><label>{type==="project"?"Relationship":"Designation / Role"}</label><input value={position} onChange={e=>setPosition(e.target.value)}/></div>
          <div className="field"><label>Issue Date</label><input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)}/></div>
          <div className="field full"><label>Certificate Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)}/></div>
          <div className="field"><label>Expiry Date</label><input type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/><span className="hint">Leave blank for no expiry.</span></div>
          {kinds[kind].needsPeriod&&<><div className="field"><label>{type==="intern"?"Internship From":"Service From"}</label><input type="date" value={serviceFrom} onChange={e=>setServiceFrom(e.target.value)}/></div><div className="field"><label>{type==="intern"?"Internship To":"Service To"}</label><input type="date" value={serviceTo} onChange={e=>setServiceTo(e.target.value)}/></div></>}

          {type==="employee"&&<><div className="field"><label>Father's Name</label><input value={fatherName} onChange={e=>setFatherName(e.target.value)}/></div><div className="field"><label>Mother's Name</label><input value={motherName} onChange={e=>setMotherName(e.target.value)}/></div><div className="field"><label>NID No.</label><input value={nidNo} onChange={e=>setNidNo(e.target.value)}/></div><div className="field"><label>Employee ID</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div><div className="field full privacy">NID is stored for internal certificate records, but the public verification page masks it automatically.</div></>}

          {type==="intern"&&<><div className="field full"><label>Institute / College</label><input value={institution} onChange={e=>setInstitution(e.target.value)} required/></div><div className="field"><label>Department / Technology</label><input value={department} onChange={e=>setDepartment(e.target.value)}/></div><div className="field"><label>Supervisor</label><input value={supervisor} onChange={e=>setSupervisor(e.target.value)}/></div><div className="field full"><label>Training Area</label><input value={trainingArea} onChange={e=>setTrainingArea(e.target.value)} placeholder="e.g. AutoCAD, architectural drafting, site supervision"/></div></>}

          {type==="project"&&<><div className="field"><label>Building Stories</label><input value={buildingStories} onChange={e=>setBuildingStories(e.target.value)}/></div><div className="field"><label>Building Use</label><input value={buildingUse} onChange={e=>setBuildingUse(e.target.value)}/></div><div className="field"><label>S.A. Dag</label><input value={saDag} onChange={e=>setSaDag(e.target.value)}/></div><div className="field"><label>B.S. Dag</label><input value={bsDag} onChange={e=>setBsDag(e.target.value)}/></div><div className="field"><label>J.L. No.</label><input value={jlNo} onChange={e=>setJlNo(e.target.value)}/></div><div className="field"><label>Mouza</label><input value={mouza} onChange={e=>setMouza(e.target.value)}/></div><div className="field"><label>Land Area (decimal)</label><input value={landArea} onChange={e=>setLandArea(e.target.value)}/></div><div className="field"><label>P.S. / Thana</label><input value={ps} onChange={e=>setPs(e.target.value)}/></div><div className="field"><label>District</label><input value={district} onChange={e=>setDistrict(e.target.value)}/></div><div className="field"><label>Structural Designer</label><input value={structuralDesigner} onChange={e=>setStructuralDesigner(e.target.value)}/></div><div className="field"><label>Soil Test Company</label><input value={soilTestCompany} onChange={e=>setSoilTestCompany(e.target.value)}/></div><div className="field"><label>Soil Test Date</label><input value={soilTestDate} onChange={e=>setSoilTestDate(e.target.value)} placeholder="e.g. 10 October 2026"/></div><div className="field full"><label>Construction Stage</label><input value={constructionProgress} onChange={e=>setConstructionProgress(e.target.value)}/></div></>}

          {type!=="project"&&<div className="field full"><label>Certificate Statement / Template</label><textarea value={description} onChange={e=>setDescription(e.target.value)}/><span className="hint">The selected certificate type loads a standard template. You can edit it before issuing.</span></div>}
        </div>
        <div className="actions"><button className="btn primary" type="submit" disabled={loading}>{loading?"Issuing…":reissueOf?"Issue New Revision":"Issue Certificate"}</button><button className="btn" type="button" onClick={()=>selectKind(kind,true)}>Reset</button>{issued&&<button className="btn dark" type="button" onClick={printCurrent}>Print / Save PDF</button>}</div>
      </form>

      <section className="card"><div className="sectionTitle"><h2>{issued?"Issued Certificate":"Live Preview"}</h2><span className={`status ${(preview.status||"").toLowerCase()}`}>{issued?issued.status:"DRAFT"}</span></div><div className="previewWrap"><CertificateDocument issued={preview}/></div>{issued&&<div className="actions"><button className="btn dark" onClick={printCurrent}>Print / Save PDF</button>{issued.verificationUrl&&<><button className="btn" onClick={()=>copyLink(issued)}>Copy Verification Link</button><button className="btn" onClick={()=>window.open(issued.verificationUrl,"_blank")}>Open Verification</button></>}</div>}</section>
    </div>}

    {tab==="registry"&&<section className="card"><div className="sectionTitle"><h2>Certificate Registry</h2><span className="muted">{filtered.length} of {records.length} certificates</span></div><div className="registryTools"><input className="btn" style={{textAlign:"left",fontWeight:500}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search certificate no., name, subject, ID, institute…"/><select className="btn" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All recipients</option><option value="project">Projects</option><option value="employee">Employees</option><option value="intern">Interns</option><option value="building">Legacy building</option></select><select className="btn" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="superseded">Superseded</option><option value="revoked">Revoked</option><option value="withdrawn">Withdrawn</option><option value="deleted">Legacy Deleted</option></select></div>
      <div className="tableWrap">{loadingRegistry?<div className="empty">Loading registry…</div>:filtered.length===0?<div className="empty">No certificates match these filters.</div>:<table className="registry"><thead><tr><th>Certificate</th><th>Recipient</th><th>Type / Subject</th><th>Issued</th><th>Status</th><th>Revision</th><th>Actions</th></tr></thead><tbody>{filtered.map(item=>{const status=(item.status||"Active");const active=status.toLowerCase()==="active";return <tr key={item.certificateId}><td><strong>{item.certificateId}</strong><span className="muted">{item.reference||item.studentId||"No reference"}</span></td><td><strong>{item.name}</strong><span className="muted">{item.type==="intern"?(item.institution||"Intern student"):(item.position||"—")}</span></td><td><strong>{item.subject}</strong><span className="muted">{item.type.toUpperCase()}</span></td><td>{displayDate(item.issuedAt)}</td><td><span className={`status ${status.toLowerCase()}`}>{status}</span></td><td><strong>Rev. {item.revision||1}</strong>{item.parentId&&<span className="muted">Root: {item.parentId}</span>}{item.supersededBy&&<span className="muted">→ {item.supersededBy}</span>}</td><td><div className="rowActions">{item.verificationUrl&&<><button className="btn" onClick={()=>window.open(item.verificationUrl,"_blank")}>Verify</button><button className="btn" onClick={()=>copyLink(item)}>Copy Link</button></>}{item.type!=="building"&&active&&<button className="btn" onClick={()=>editReissue(item)}>Reissue</button>}{active&&<><button className="btn danger" onClick={()=>processCertificate(item,"revoke")}>Revoke</button><button className="btn danger" onClick={()=>processCertificate(item,"withdraw")}>Withdraw</button></>}</div></td></tr>})}</tbody></table>}</div>
    </section>}
  </main>;
}
